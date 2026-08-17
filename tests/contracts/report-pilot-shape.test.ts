import { describe, expect, it } from 'vitest'
import { pilotReportRow, type PilotReportRow } from '@/lib/report/pilot-row'
import { pilotFlight, pilotTraining, testPerson, testWindow } from '../support/pilots'
import { directKeys, jsonType } from '../support/report-oracle'

// schema parity over the operator report's data.pilots[] block, never value parity - the
// rebuild has its own records (docs/rebuild/00-operating-model.md §5). the block the oracle
// nests deepest, so this suite asserts a key set at **every** level rather than only the
// pilot row: `trainings[]`, `filtered_flights[]`, `flights_by_device[]` and the `flights[]`
// inside it each have their own captured shape and each is checked against it.
//
// the payload spells four of these keys `licence_*`. they are the oracle's names and parity
// freezes them; every identifier and sentence around them says certificate.

const PILOT = 'data.pilots[].'
const TRAINING = 'data.pilots[].trainings[].'
const FILTERED = 'data.pilots[].filtered_flights[].'
const GROUP = 'data.pilots[].flights_by_device[].'
const GROUPED = 'data.pilots[].flights_by_device[].flights[].'

const window = testWindow()

// a pilot who flew two airframes and one unassigned flight, holds certificates, and holds a
// training that covered an airframe. every sparse path in the block is reached by this one
// row: `licence_types[]` (258 captured members) and `trainings[].devices[]` (3 against 326
// training rows) exist in the oracle only because some captured row carried them.
const busy = pilotReportRow({
  pilot: testPerson({
    certificateNumber: 'CERT-PLACEHOLDER-0001',
    certificateTypes: ['A1_A3', 'A2'],
    certificateValidUntil: '2027-06-30',
  }),
  trainings: [
    pilotTraining({ airframes: ['SN-PLACEHOLDER-0001'] }),
    pilotTraining({ name: 'Placeholder Unclassified Training', trainingTypeName: null, heldOn: null, validUntil: null }),
  ],
  flights: [
    pilotFlight({ id: 1, deviceId: 1 }),
    pilotFlight({ id: 2, deviceId: 1 }),
    pilotFlight({ id: 3, deviceId: 2, serialNumber: 'SN-PLACEHOLDER-0002' }),
    pilotFlight({ id: 4, deviceId: null }),
  ],
  window,
})

// the row a serialiser is most likely to answer with a null the oracle does not allow: no
// e-mail, no certificate, no training and no flight in the period. every key is still here
// and every non-null one is still non-null.
const quiet = pilotReportRow({
  pilot: testPerson({ id: 2, name: 'Placeholder Quiet Pilot', email: null }),
  trainings: [],
  flights: [],
  window,
})

const rows: PilotReportRow[] = [busy, quiet]

const levels = [
  { label: 'a pilot', prefix: PILOT, members: rows },
  { label: 'a training', prefix: TRAINING, members: rows.flatMap((row) => row.trainings) },
  { label: 'a filtered flight', prefix: FILTERED, members: rows.flatMap((row) => row.filtered_flights) },
  { label: 'an airframe grouping', prefix: GROUP, members: rows.flatMap((row) => row.flights_by_device) },
  {
    label: 'a grouped flight',
    prefix: GROUPED,
    members: rows.flatMap((row) => row.flights_by_device).flatMap((group) => group.flights),
  },
] satisfies { label: string; prefix: string; members: readonly object[] }[]

const valuesOf = (member: object) => member as Record<string, unknown>

describe('report parity: every level of the data.pilots[] block carries the captured key set', () => {
  it('the oracle carries keys at all five levels to assert against', () => {
    for (const level of levels) {
      expect(directKeys(level.prefix).length, level.prefix).toBeGreaterThan(0)
    }
  })

  it.each(levels)('$label serialises exactly the captured keys', ({ prefix, members }) => {
    // without this the key-set assertion below would pass over an empty array while
    // claiming to have covered the level
    expect(members.length).toBeGreaterThan(0)

    const captured = directKeys(prefix)
      .map((key) => key.path.slice(prefix.length))
      .sort()

    for (const member of members) {
      expect(Object.keys(member).sort()).toEqual(captured)
    }
  })
})

describe('report parity: types, where the oracle has a type to assert', () => {
  for (const { prefix, members } of levels) {
    const typed = directKeys(prefix).filter((key) => key.types.some((type) => type !== 'null'))

    it.each(typed.map((key) => [key.path, key] as const))('%s matches the captured type', (_path, key) => {
      const name = key.path.slice(prefix.length)

      for (const member of members) {
        const value = valuesOf(member)[name]
        expect(key.types, `${key.path} was ${jsonType(value)}`).toContain(jsonType(value))
      }
    })
  }

  // the two string arrays, whose members the oracle types in their own right. asserting the
  // array is an array says nothing about what is in it.
  it.each([
    ['data.pilots[].licence_types[]', busy.licence_types],
    ['data.pilots[].trainings[].devices[]', busy.trainings[0]?.devices ?? []],
  ] as const)('%s is served and its members are strings', (_path, members) => {
    expect(members.length).toBeGreaterThan(0)
    expect(members.every((member) => typeof member === 'string')).toBe(true)
  })
})

describe('report parity: the keys R3 exists to prove', () => {
  it('a pilot with no e-mail carries a label, never a blank and never an address', () => {
    expect(quiet.email).not.toBe('')
    expect(quiet.email).not.toContain('@')
    expect(quiet.email).not.toBe(busy.email)
  })

  it('a pilot who flew nothing reports zeroes, not nulls and not a division by zero', () => {
    expect(quiet.flights_count).toBe(0)
    expect(quiet.total_minutes).toBe(0)
    expect(quiet.total_hours).toBe(0)
    expect(quiet.avg_minutes).toBe(0)
    expect(quiet.avg_hours).toBe(0)
    expect(quiet.filtered_flights).toEqual([])
    expect(quiet.flights_by_device).toEqual([])
  })

  it('groups by airframe two deep, and a flight naming none lists without a group', () => {
    // four flights over two airframes and one unassigned: the groups hold three of them
    expect(busy.filtered_flights).toHaveLength(4)
    expect(busy.flights_by_device.map((group) => group.total_flights)).toEqual([2, 1])
    expect(busy.flights_by_device.flatMap((group) => group.flights)).toHaveLength(3)
    expect(busy.flights_by_device.map((group) => group.device_serial_number)).toEqual([
      'SN-PLACEHOLDER-0001',
      'SN-PLACEHOLDER-0002',
    ])
  })

  it('names the training with no type and the training with no date, rather than blanking them', () => {
    const [, unclassified] = busy.trainings

    expect(unclassified?.training_type).not.toBe('')
    expect(unclassified?.date_start).not.toBe('')
    expect(unclassified?.training_type).not.toBe(busy.trainings[0]?.training_type)
  })

  it('carries no certificate as its own answer, distinct from a certificate that never expires', () => {
    const noExpiry = pilotReportRow({
      pilot: testPerson({ certificateNumber: 'CERT-PLACEHOLDER-0002', certificateValidUntil: null }),
      trainings: [],
      flights: [],
      window,
    })

    expect(quiet.licence_status).not.toBe(noExpiry.licence_status)
    expect(quiet.licence_number).toBeNull()
    expect(quiet.licence_types).toEqual([])
    expect(noExpiry.licence_date).toBeNull()
  })
})
