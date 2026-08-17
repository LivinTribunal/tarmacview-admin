import { serviceReadings } from '@/lib/devices/service-schedule'
import { airframeReportRow, type DeviceReportRow } from '@/lib/report/device-row'
import {
  flightHours,
  flightReportRow,
  reportDate,
  type FlightReportRow,
} from '@/lib/report/flight-row'
import {
  expiryWindow,
  pilotReportRow,
  type PilotFlightInput,
  type PilotReportRow,
  type PilotTrainingInput,
} from '@/lib/report/pilot-row'
import { identifier } from '@/lib/routes/identifier'
import type { AirframeReportEntry } from '@/lib/tenant/scoped-airframes'
import type { FlightReportEntry, FlightSelection } from '@/lib/tenant/scoped-flights'
import type { OrganizationPersonEntry } from '@/lib/tenant/scoped-people'
import type { TrainingEntry } from '@/lib/tenant/scoped-trainings'

// the operator report's JSON envelope - doc 06 §"Data endpoint". the period, the four
// totals, and the three blocks under them.

export type ReportPayload = {
  success: true
  data: {
    period_dates: { from: string; to: string }
    total_flights: number
    total_flight_minutes: number
    total_flight_hours: number
    active_pilots: number
    pilots: PilotReportRow[]
    devices: DeviceReportRow[]
    flights: FlightReportRow[]
  }
}

// the oracle paths this endpoint does not serve. empty since R3, so what
// tests/contracts/report-flight-shape.test.ts claims is that **every** oracle path under
// `data.` is served - the strongest form that assertion has. a block that cannot be served
// is declared here rather than sent as an empty array, which would state a fact about an
// operator instead of naming a gap.
export const pendingBlocks: readonly string[] = []

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// month boundaries and every date variant resolve in UTC, matching src/lib/i18n's recorded
// choice. which zone a reader should see one in wants an organisation or a browser to key
// off, and the report page is the first thing that will have either.
function calendarMonth(asOf: Date, offset: number): FlightSelection {
  const from = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + offset, 1))
  const to = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + offset + 1, 1) - 1)
  return { from, to, pilotId: null, deviceId: null }
}

// `YYYY-MM-DD`, the wire format a date control submits. the `DD.MM.YYYY` this application
// prints is what a reader sees, never what a query string carries.
function boundary(value: string | null, endOfDay: boolean): Date | null {
  if (value === null || !ISO_DAY.test(value)) return null
  const at = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(at.getTime()) ? null : at
}

// an absent filter and an empty one are the same thing: doc 06 records the report submitting
// `pilot_id=&device_id=` with nothing in them.
function filter(value: string | null): { ok: true; id: number | null } | { ok: false } {
  if (value === null || value === '') return { ok: true, id: null }
  const id = identifier(value)
  return id === null ? { ok: false } : { ok: true, id }
}

// null is the JSON-error case, which doc 06 records as a deliberate departure: the
// predecessor answered an unrecognised period with an HTML error page. an unusable `custom`
// range and an unparseable filter are the same class of error and get the same answer.
//
// an absent period is `this_month`, which is the report's own landing state rather than an
// error - the screen is opened before a period is ever picked.
export function resolveSelection(query: URLSearchParams, asOf: Date): FlightSelection | null {
  const pilot = filter(query.get('pilot_id'))
  const device = filter(query.get('device_id'))
  if (!pilot.ok || !device.ok) return null

  const filters = { pilotId: pilot.id, deviceId: device.id }

  switch (query.get('period') ?? 'this_month') {
    case 'this_month':
      return { ...calendarMonth(asOf, 0), ...filters }
    case 'last_month':
      return { ...calendarMonth(asOf, -1), ...filters }
    case 'custom': {
      const from = boundary(query.get('date_from'), false)
      const to = boundary(query.get('date_to'), true)

      // a range ending before it starts is unusable in exactly the way a missing one is, so
      // it answers the same error rather than an empty report. `total_flights: 0` there would
      // read as "nothing was flown in this window" when what happened is that the two dates
      // arrived the wrong way round - a gap reading as a fact.
      if (from === null || to === null || from > to) return null
      return { from, to, ...filters }
    }
    default:
      return null
  }
}

// the period-filtered totals one airframe carries, accumulated from the flight entries the
// report already has in hand. the all-time figures are a different quantity and are not here -
// docs/specs/06-org-report.md §"The data endpoint in the rebuild" owns the distinction.
type PeriodTotals = { flights: number; seconds: number; lastFlightDate: Date | null }

// one named input rather than seven positional arguments, so the three call sites cannot
// silently swap two of them. `expiryWarningDays` is the **organisation's own** window and
// never a constant - doc 06 §Layout item 2 keys the expiry warnings off it.
export type ReportInput = {
  entries: readonly FlightReportEntry[]
  airframes: readonly AirframeReportEntry[]
  // every pilot the organisation rosters, whether or not they flew in the period
  pilots: readonly OrganizationPersonEntry[]
  // all-time, never period-filtered, and covering the whole organisation - grouped by pilot
  // below rather than read once per pilot
  trainings: readonly TrainingEntry[]
  selection: FlightSelection
  asOf: Date
  expiryWarningDays: number
}

// keyed by pilot id, so a training or a flight naming nobody groups under nothing
function groupByPilot<T>(rows: readonly { pilotId: number | null; value: T }[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>()

  for (const { pilotId, value } of rows) {
    if (pilotId === null) continue
    const group = grouped.get(pilotId) ?? []
    group.push(value)
    grouped.set(pilotId, group)
  }
  return grouped
}

export function reportPayload(input: ReportInput): ReportPayload {
  const { entries, airframes, selection, asOf } = input
  const seconds = entries.reduce((total, entry) => total + (entry.totalFlightTimeSeconds ?? 0), 0)

  // distinct pilots with at least one flight in the period, counted by id: an unassigned
  // flight names nobody and so contributes to no count, which is the honest answer rather
  // than a pilot invented to hold it.
  const pilots = new Set(entries.map((entry) => entry.pilotId).filter((id) => id !== null))

  // serialised once and read twice, so the two blocks cannot disagree about the period: the
  // per-airframe totals below are grouped from these very rows rather than queried again,
  // and the date they group on is the row's own `flight_date_sort`.
  const flights = entries.map((entry) => ({
    entry,
    row: flightReportRow({
      flight: entry,
      pilotName: entry.pilotName,
      airframe:
        entry.deviceSerialNumber === null
          ? null
          : { serialNumber: entry.deviceSerialNumber, model: entry.deviceModel },
      deviceType: { maxVlos: entry.deviceMaxVlos },
      firstLegStartedAt: entry.firstLegStartedAt,
    }),
  }))

  // a flight naming no airframe groups under none and belongs to no device row, which is the
  // correct answer rather than a dropped flight - it still lists in data.flights[]
  const period = new Map<number, PeriodTotals>()
  for (const { entry, row } of flights) {
    if (entry.deviceId === null) continue
    const totals = period.get(entry.deviceId) ?? { flights: 0, seconds: 0, lastFlightDate: null }
    const at = new Date(row.flight_date_sort)

    period.set(entry.deviceId, {
      flights: totals.flights + 1,
      seconds: totals.seconds + (entry.totalFlightTimeSeconds ?? 0),
      lastFlightDate:
        totals.lastFlightDate === null || at > totals.lastFlightDate ? at : totals.lastFlightDate,
    })
  }

  // the pilot block reads the very same serialised rows a third time. the trainings beside
  // them are the one thing here that is not period-filtered, and grouping both by pilot id
  // costs one pass each rather than a read per rostered pilot.
  const pilotFlights = groupByPilot<PilotFlightInput>(
    flights.map(({ entry, row }) => ({
      pilotId: entry.pilotId,
      value: { seconds: entry.totalFlightTimeSeconds, row },
    })),
  )
  const pilotTrainings = groupByPilot<PilotTrainingInput>(
    input.trainings.map((training) => ({ pilotId: training.pilotId, value: training })),
  )

  const window = expiryWindow(asOf, input.expiryWarningDays)

  return {
    success: true,
    data: {
      period_dates: {
        from: reportDate(selection.from).display,
        to: reportDate(selection.to).display,
      },
      total_flights: entries.length,

      // one figure in two units, as the payload has it, and both derived from the seconds
      // rather than from each other
      total_flight_minutes: Math.round(seconds / 60),
      total_flight_hours: flightHours(seconds),

      active_pilots: pilots.size,

      // every pilot the organisation rosters, whether or not they flew - the rule the
      // airframes below already follow, because dropping them would hide a pilot from the
      // roster the report is evidence about. `active_pilots` above is the *other* number and
      // the two legitimately disagree: a flight flown by somebody whose role is not `pilot`
      // counts there and has no row here. doc 06 says so in its own words.
      pilots: input.pilots.map((pilot) =>
        pilotReportRow({
          pilot,
          trainings: pilotTrainings.get(pilot.id) ?? [],
          flights: pilotFlights.get(pilot.id) ?? [],
          window,
        }),
      ),

      // every airframe of the operator, whether or not it flew in the period. one that flew
      // nothing reports zero totals; dropping it would hide an airframe from the fleet the
      // report is evidence about.
      devices: airframes.map((airframe) => {
        const totals = period.get(airframe.device.id)

        return airframeReportRow({
          device: airframe.device,
          deviceType: airframe.deviceType,
          readings: serviceReadings({
            maintenance: airframe.maintenance,
            lifetimeCycles: airframe.lifetimeFlights,
            firstFlightDate: airframe.firstFlightDate,
            asOf,
          }),
          totals: {
            flights: totals?.flights ?? 0,
            flightHours: flightHours(totals?.seconds ?? 0),
            lastFlightDate: totals?.lastFlightDate ?? null,
          },
          maintenance: airframe.maintenance,
        })
      }),

      flights: flights.map(({ row }) => row),
    },
  }
}
