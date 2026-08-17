import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pendingBlocks, reportPayload } from '@/lib/report/payload'
import type { AirframeReportEntry } from '@/lib/tenant/scoped-airframes'
import type { FlightReportEntry, FlightSelection } from '@/lib/tenant/scoped-flights'
import { configuredType, maintenanceRecord, testAirframe } from '../support/airframes'
import { testFlight } from '../support/flights'

// schema parity over the operator report's envelope and its data.devices[] and
// data.flights[] blocks, never value parity - the rebuild has its own records
// (docs/rebuild/00-operating-model.md §5).
//
// this suite walks the whole payload rather than one row's key set, because it has two
// claims to make and the second needs the walk: **no key outside the oracle**, and **the
// oracle paths not yet served are exactly the declared pending list**. A block dropped by
// accident then fails here instead of passing as "not built yet" - the parent's decision 3,
// which is the repo's own rule that a gap must never read as a pass, applied to the payload.
//
// the oracle-loading preamble is copied from report-device-shape.test.ts rather than shared.
// two copies is where src/lib/routes/identifier.ts records extraction as not yet earned; R3
// is the third block and it extracts.

type OracleKey = { path: string; types: string[]; nullable: boolean }

const oracle: { keys: OracleKey[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../contracts/report-schema.json', import.meta.url)), 'utf8'),
)

const jsonType = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// the payload as the oracle spells it: `$` at the root, `[]` for an array's members, and a
// dotted path for everything else. the same path can be reached by several rows, so each
// collects every type observed at it.
function walk(value: unknown, at: string, found = new Map<string, Set<string>>()) {
  found.set(at, (found.get(at) ?? new Set()).add(jsonType(value)))

  if (Array.isArray(value)) {
    for (const item of value) walk(item, `${at}[]`, found)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walk(child, at === '$' ? key : `${at}.${key}`, found)
    }
  }
  return found
}

const selection: FlightSelection = {
  from: new Date('2026-08-01T00:00:00.000Z'),
  to: new Date('2026-08-31T23:59:59.999Z'),
  pilotId: null,
  deviceId: null,
}

function entry(overrides: Partial<FlightReportEntry> = {}): FlightReportEntry {
  return {
    ...testFlight(),
    pilotName: 'Alpha Pilot',
    deviceSerialNumber: 'SN-ALPHA-0001',
    deviceModel: 'Placeholder Model',
    deviceMaxVlos: '500',
    firstLegStartedAt: new Date('2026-08-14T09:00:00Z'),
    ...overrides,
  }
}

const asOf = new Date('2026-08-15T00:00:00Z')

// a serviced airframe that is due by cycles, and one with no device type. the first is
// deliberately overdue: `data.devices[].service_due_reasons[]` is an oracle path that only
// exists on a row with a reason, so an entirely un-due fleet would leave it unserved and
// fail the pending-blocks claim below.
const airframes: AirframeReportEntry[] = [
  {
    device: testAirframe({}),
    deviceType: configuredType(),
    lifetimeFlights: 200,
    firstFlightDate: new Date('2026-01-04T09:00:00Z'),
    maintenance: [maintenanceRecord()],
  },
  {
    device: testAirframe({ id: 2, deviceTypeId: null }),
    deviceType: null,
    lifetimeFlights: 0,
    firstFlightDate: null,
    maintenance: [],
  },
]

// an ordinary flight and the two rows a serialiser is most likely to answer with a null the
// oracle does not allow: one assigned to nobody, and one whose parse failed and recorded no
// measurements at all.
const payload = reportPayload(
  [
    entry(),
    entry({
      ...testFlight({ id: 2, pilotId: null, deviceId: null }),
      pilotName: null,
      deviceSerialNumber: null,
      deviceModel: null,
      deviceMaxVlos: null,
      firstLegStartedAt: null,
    }),
    entry({
      ...testFlight({
        id: 3,
        parsingStatus: null,
        parsingErrors: null,
        totalFlightTimeSeconds: null,
        maxAltitudeMeters: null,
        maxDistanceMeters: null,
      }),
      firstLegStartedAt: null,
    }),
  ],
  airframes,
  selection,
  asOf,
)

const served = walk(payload, '$')
const oraclePaths = oracle.keys.map((key) => key.path)
const pending = (path: string) =>
  pendingBlocks.some((block) => path === block || path.startsWith(`${block}.`) || path.startsWith(`${block}[`))

// the one subtree the oracle has nothing below: every captured `maintenance_logs` was empty,
// so the member shape is the rebuild's own and no key under it can be checked against the
// predecessor - tests/contracts/report-device-shape.test.ts states that ceiling and asserts
// what it does claim. declared here rather than quietly filtered, because the assertion it
// carves an exception out of is the payload's whole no-invented-keys claim.
const ownShape = 'data.devices[].maintenance_logs[]'

describe('report parity: the payload carries the captured paths and no others', () => {
  it('the oracle carries paths to assert against, and the payload carries both blocks', () => {
    expect(oraclePaths.length).toBeGreaterThan(0)

    // without these the assertions below would pass over empty arrays while claiming to
    // have covered every key under them
    expect(served.has('data.flights[].id')).toBe(true)
    expect(served.has('data.devices[].id')).toBe(true)
  })

  it('serialises no key the oracle does not carry, outside the one subtree that is ours', () => {
    expect(
      [...served.keys()]
        .filter((path) => !oraclePaths.includes(path) && !path.startsWith(ownShape))
        .sort(),
    ).toEqual([])
  })

  it('and that subtree is served, so the exception above is not covering an empty array', () => {
    expect(served.has(ownShape)).toBe(true)
  })

  it('leaves unserved exactly the declared pending blocks', () => {
    expect(oraclePaths.filter((path) => !served.has(path)).sort()).toEqual(
      oraclePaths.filter(pending).sort(),
    )
  })
})

describe('report parity: types, where the oracle has a type to assert', () => {
  const typed = oracle.keys.filter(
    (key) => !pending(key.path) && key.types.some((type) => type !== 'null'),
  )

  it.each(typed.map((key) => [key.path, key] as const))('%s matches the captured type', (path, key) => {
    for (const type of served.get(path) ?? []) {
      expect(key.types, `${path} was ${type}`).toContain(type)
    }
  })
})

describe('the pending list shrinks by what is served, and by nothing else', () => {
  it('names data.pilots only, now that the airframes block is served', () => {
    expect([...pendingBlocks]).toEqual(['data.pilots'])
    expect(served.has('data.devices[].service_warning')).toBe(true)
  })
})

describe('report parity: the keys R1 exists to prove', () => {
  const [assigned, unassigned, unparsed] = payload.data.flights

  it('an unassigned flight lists, with null ids beside non-null label strings', () => {
    expect(unassigned?.pilot_id).toBeNull()
    expect(unassigned?.device_id).toBeNull()
    expect(typeof unassigned?.pilot_name).toBe('string')
    expect(unassigned?.pilot_name).not.toBe('')
    expect(unassigned?.device_serial_number).not.toBe('')
    expect(unassigned?.device_model).not.toBe('')
  })

  it('a flight that was never parsed carries a status naming that, and not a parsed one', () => {
    expect(unparsed?.parsing_status).not.toBe('')
    expect(unparsed?.parsing_status).not.toBe(assigned?.parsing_status)

    // the one blank that is honest: no error recorded is exactly what an empty message means
    expect(unparsed?.parsing_errors).toBe('')
  })

  it('nullable measurements serialise as zero, because the oracle types them non-null', () => {
    expect(unparsed?.flight_hours).toBe(0)
    expect(unparsed?.max_altitude).toBe(0)
    expect(unparsed?.max_distance).toBe(0)
  })

  it('the period renders DD.MM.YYYY and the totals are one quantity in two units', () => {
    expect(payload.data.period_dates).toEqual({ from: '01.08.2026', to: '31.08.2026' })
    expect(payload.data.total_flights).toBe(3)
    expect(payload.data.total_flight_minutes).toBe(170)
    expect(payload.data.total_flight_hours).toBe(2.83)
  })

  it('counts distinct pilots, and an unassigned flight contributes to none', () => {
    // two of the three rows name pilot 1 and the third names nobody
    expect(payload.data.active_pilots).toBe(1)
  })
})
