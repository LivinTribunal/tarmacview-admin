import { describe, expect, it } from 'vitest'
import { serviceReadings } from '@/lib/devices/service-schedule'
import { reportPayload } from '@/lib/report/payload'
import type { AirframeReportEntry } from '@/lib/tenant/scoped-airframes'
import type { FlightReportEntry, FlightSelection } from '@/lib/tenant/scoped-flights'
import { configuredType, maintenanceRecord, testAirframe } from '../support/airframes'
import { testFlight } from '../support/flights'

// **maintenance readings are stated, not computed** - the named invariant in
// docs/rebuild/00-operating-model.md §5, and the rule this slice exists to respect. every
// figure in a service baseline was certified by a technician or is absent; none of it is
// re-derived from the airframe's own flight history at read time.
//
// docs/specs/03-data-model.md §"Maintenance log in the rebuild" is what these assert.

const asOf = new Date('2026-08-15T00:00:00Z')

const stated = (maintenanceDate: string, totalFlights: number | null) =>
  maintenanceRecord({ maintenanceDate, totalFlights })

describe('the cycle baseline is a stated reading and never a computed one', () => {
  it('takes the count the technician stated at the last service', () => {
    const readings = serviceReadings({
      maintenance: [stated('2026-05-20', 120)],
      lifetimeCycles: 160,
      firstFlightDate: new Date('2026-01-04T09:00:00Z'),
      asOf,
    })

    expect(readings.baselineCycles).toBe(120)
    expect(readings.baselineDate).toEqual(new Date('2026-05-20T00:00:00Z'))

    // the lifetime count is the airframe's own record and is carried through untouched;
    // it is never what the baseline is derived from
    expect(readings.lifetimeCycles).toBe(160)
  })

  it('never recomputes the baseline from the lifetime count', () => {
    // an airframe that has flown 500 times since a service at 120 is 380 cycles into its
    // interval. a baseline "corrected" to the lifetime figure would report it as freshly
    // serviced, which is a reading nobody took.
    const readings = serviceReadings({
      maintenance: [stated('2026-05-20', 120)],
      lifetimeCycles: 500,
      firstFlightDate: null,
      asOf,
    })
    expect(readings.baselineCycles).toBe(120)
  })
})

describe('a record stating no cycle count moves only the calendar baseline', () => {
  const history = [stated('2026-07-05', null), stated('2026-05-20', 120)]

  it('takes the calendar baseline from the newest record, count or no count', () => {
    // the service happened, and the date it happened is a fact whether or not anybody
    // wrote a cycle count on the form
    const readings = serviceReadings({
      maintenance: history,
      lifetimeCycles: 160,
      firstFlightDate: new Date('2026-01-04T09:00:00Z'),
      asOf,
    })
    expect(readings.baselineDate).toEqual(new Date('2026-07-05T00:00:00Z'))
  })

  it('takes the cycle baseline from the newest record that stated one', () => {
    // zeroing it because the newest record omitted a count would report a just-serviced
    // airframe as hundreds of cycles overdue - a fabricated derivation, not a cautious one
    const readings = serviceReadings({
      maintenance: history,
      lifetimeCycles: 160,
      firstFlightDate: null,
      asOf,
    })
    expect(readings.baselineCycles).toBe(120)
  })

  it('composes the same baseline whichever order the history arrives in', () => {
    const forwards = serviceReadings({
      maintenance: [...history].reverse(),
      lifetimeCycles: 160,
      firstFlightDate: null,
      asOf,
    })
    expect(forwards.baselineCycles).toBe(120)
    expect(forwards.baselineDate).toEqual(new Date('2026-07-05T00:00:00Z'))
  })
})

describe('an airframe no record has ever stated a count for', () => {
  it('reads zero cycles at its last service, which is the reading and not a fallback', () => {
    const readings = serviceReadings({
      maintenance: [stated('2026-07-05', null)],
      lifetimeCycles: 160,
      firstFlightDate: null,
      asOf,
    })

    // 0 and never 160: an airframe serviced with no count stated had, so far as anybody
    // certified, zero cycles at that service
    expect(readings.baselineCycles).toBe(0)
  })

  it('falls the calendar baseline back to the first recorded flight where it was never serviced', () => {
    // the date handed in is the flight's **derived** date - the earliest leg start, not the
    // import instant. docs/specs/03-data-model.md §"Flights in the rebuild" owns that
    // derivation and tests/tenancy/report-data-isolation.test.ts asserts it against a real
    // read, where a `created_at` implementation goes red.
    const flown = new Date('2026-07-14T09:00:00Z')
    const readings = serviceReadings({
      maintenance: [],
      lifetimeCycles: 3,
      firstFlightDate: flown,
      asOf,
    })

    expect(readings.baselineDate).toEqual(flown)
    expect(readings.baselineCycles).toBe(0)
  })

  it('leaves the calendar baseline absent where it has never been serviced and never flown', () => {
    const readings = serviceReadings({
      maintenance: [],
      lifetimeCycles: 0,
      firstFlightDate: null,
      asOf,
    })

    // null, and not an instant invented to fill it: there is no date to count months from
    expect(readings.baselineDate).toBeNull()
  })
})

// the second half of the slice: the two flight aggregates are different quantities, and the
// payload must not let them drift into each other.

const july: FlightSelection = {
  from: new Date('2026-07-01T00:00:00.000Z'),
  to: new Date('2026-07-31T23:59:59.999Z'),
  pilotId: null,
  deviceId: null,
}
const september: FlightSelection = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.999Z'),
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
    firstLegStartedAt: new Date('2026-07-14T09:00:00Z'),
    ...overrides,
  }
}

const airframe: AirframeReportEntry = {
  device: testAirframe({}),
  deviceType: configuredType(),
  lifetimeFlights: 160,
  firstFlightDate: new Date('2026-01-04T09:00:00Z'),
  maintenance: [maintenanceRecord()],
}

// two flights of the airframe and one naming no airframe at all, which belongs to no device
// row and still lists in data.flights[]
const flown = [
  entry(),
  entry({
    ...testFlight({ id: 2, totalFlightTimeSeconds: 1800 }),
    firstLegStartedAt: new Date('2026-07-20T09:00:00Z'),
  }),
  entry({
    ...testFlight({ id: 3, deviceId: null }),
    deviceSerialNumber: null,
    deviceModel: null,
    deviceMaxVlos: null,
  }),
]

describe('the two flight aggregates on an airframe are different quantities', () => {
  const payload = reportPayload({
    entries: flown,
    airframes: [airframe],
    pilots: [],
    trainings: [],
    selection: july,
    asOf,
    expiryWarningDays: 40,
  })
  const [row] = payload.data.devices

  it('the period totals agree with that airframe rows in data.flights[] for the same window', () => {
    // grouped from the very rows the flights block is serialised from, so this is true by
    // construction rather than by a second query staying in step with the first
    const its = payload.data.flights.filter((flight) => flight.device_id === row?.id)
    const dates = its.map((flight) => flight.flight_date).sort()

    expect(its).toHaveLength(2)
    expect(row?.total_flights).toBe(its.length)

    // one quantity in two places: 5100 s and 1800 s flown, rendered as hours once
    expect(row?.total_flight_hours).toBe(1.92)
    expect(row?.last_flight_date).toBe(dates.at(-1))
  })

  it('counts lifetime cycles all-time, and does not move when the period narrows', () => {
    const narrowed = reportPayload({
      entries: [],
      airframes: [airframe],
      pilots: [],
      trainings: [],
      selection: september,
      asOf,
      expiryWarningDays: 40,
    })
    const [quiet] = narrowed.data.devices

    // a month with no flights: the period totals empty and the lifetime figure does not
    expect(quiet?.total_flights).toBe(0)
    expect(quiet?.service_lifetime_cycles).toBe(160)
    expect(quiet?.service_lifetime_cycles).toBe(row?.service_lifetime_cycles)
    expect(quiet?.lifetime_flights_count).toBe(160)
  })

  it('a flight naming no airframe groups under none, and still lists', () => {
    expect(payload.data.flights).toHaveLength(3)
    expect(payload.data.flights.filter((flight) => flight.device_id === null)).toHaveLength(1)
  })
})
