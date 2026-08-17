import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { airframeReportRow, type DeviceReportRow } from '@/lib/report/device-row'
import { configuredType, maintenanceRecord, readings, testAirframe } from '../support/airframes'

// schema parity over the operator report's data.devices[] block, never value parity -
// the rebuild has its own records (docs/rebuild/00-operating-model.md §5). two ceilings
// from the same section apply here and are asserted as such: a key serialised as null
// in all 216 captured rows has no type to check, so parity on it claims only that the
// key exists; and max_vlos_meters is a string in the oracle, so a rebuild that
// "corrects" it to a number fails parity and the oracle is right.

type OracleKey = { path: string; types: string[]; nullable: boolean }

const oracle: { keys: OracleKey[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../contracts/report-schema.json', import.meta.url)), 'utf8'),
)

const prefix = 'data.devices[].'
const deviceKeys = oracle.keys.filter(
  (key) => key.path.startsWith(prefix) && !key.path.endsWith('[]'),
)
const named = (key: OracleKey) => key.path.slice(prefix.length)

const jsonType = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

const serviced = airframeReportRow({
  device: testAirframe({}),
  deviceType: configuredType(),
  readings: readings({
    baselineCycles: 100,
    lifetimeCycles: 160,
    baselineDate: new Date('2026-01-01T00:00:00Z'),
    asOf: new Date('2026-08-15T00:00:00Z'),
  }),
  totals: { flights: 60, flightHours: 41.25, lastFlightDate: new Date('2026-08-14T00:00:00Z') },
  maintenance: [maintenanceRecord()],
})

const unconfigured = airframeReportRow({
  device: testAirframe({ deviceTypeId: null }),
  deviceType: null,
  readings: readings({ lifetimeCycles: 4 }),
  totals: { flights: 4, flightHours: 2, lastFlightDate: null },
  maintenance: [],
})

describe('report parity: the data.devices[] block carries the captured key set', () => {
  it('the oracle carries device keys to assert against', () => {
    expect(deviceKeys.length).toBeGreaterThan(0)
  })

  it.each([
    ['a serviced airframe', serviced],
    ['an airframe with no device type', unconfigured],
  ] as const)('%s serialises exactly the captured keys', (_label, row: DeviceReportRow) => {
    expect(Object.keys(row).sort()).toEqual(deviceKeys.map(named).sort())
  })
})

describe('report parity: types, where the oracle has a type to assert', () => {
  const typed = deviceKeys.filter((key) => key.types.some((type) => type !== 'null'))

  it.each(typed.map((key) => [named(key), key] as const))(
    '%s matches the captured type',
    (name, key) => {
      for (const row of [serviced, unconfigured]) {
        const value = row[name as keyof DeviceReportRow]
        expect(key.types, `${name} was ${jsonType(value)}`).toContain(jsonType(value))
      }
    },
  )

  // the calendar half of the service block is null in every captured row, so these keys
  // are asserted present and nothing more. saying so here is the difference between a
  // ceiling and a claim of coverage.
  it.each(
    deviceKeys.filter((key) => key.types.every((type) => type === 'null')).map((key) => named(key)),
  )('%s is present, which is all a null-only key can claim', (name) => {
    expect(serviced).toHaveProperty(name)
  })
})

describe('report parity: the three keys the walking skeleton exists to prove', () => {
  it('service_is_configured is a boolean and false for an airframe with no device type', () => {
    expect(serviced.service_is_configured).toBe(true)
    expect(unconfigured.service_is_configured).toBe(false)
  })

  it('service_due_reasons is an array of strings, empty when nothing is due', () => {
    expect(serviced.service_due_reasons.every((reason) => typeof reason === 'string')).toBe(true)
    expect(unconfigured.service_due_reasons).toEqual([])
  })

  it('max_vlos_meters is a string, as the oracle serialises it', () => {
    expect(typeof serviced.max_vlos_meters).toBe('string')
    expect(unconfigured.max_vlos_meters).toBeNull()
  })
})

// the third ceiling in this file, and the one worth stating loudest: the oracle carries no
// key path below `maintenance_logs[]`, so there is nothing under it parity can be claimed
// against. what is asserted here is the ceiling itself - the key exists and is an array -
// and that a serviced airframe does not serialise its history as empty. the member shape is
// the rebuild's own and is asserted as ours, never as agreement with the predecessor.
describe('report parity: maintenance_logs[] has no oracle below it', () => {
  it('the oracle carries no key path under the array', () => {
    expect(oracle.keys.filter((key) => key.path.startsWith(`${prefix}maintenance_logs[]`))).toEqual(
      [],
    )
  })

  it('is an array on both rows, which is all parity can claim of it', () => {
    expect(Array.isArray(serviced.maintenance_logs)).toBe(true)
    expect(unconfigured.maintenance_logs).toEqual([])
  })

  it('carries the stated record on an airframe that was serviced, and not an empty array', () => {
    // `[]` on an airframe carrying history would be a gap reading as a fact - the rule that
    // had R1 declare this whole block pending rather than serve it empty
    const [log] = serviced.maintenance_logs
    expect(serviced.maintenance_logs).toHaveLength(1)
    expect(log?.maintenance_date).toBe('2026-05-20')

    // stated and not recomputed, `h:mm` notation included: the column is text so the
    // technician's own figure survives
    expect(log?.total_flight_hours).toBe('41:30')
    expect(log?.total_flights).toBe(120)
  })
})
