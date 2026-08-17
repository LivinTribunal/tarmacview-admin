import {
  flightHours,
  flightReportRow,
  reportDate,
  type FlightReportRow,
} from '@/lib/report/flight-row'
import { identifier } from '@/lib/routes/identifier'
import type { FlightReportEntry, FlightSelection } from '@/lib/tenant/scoped-flights'

// the operator report's JSON envelope - doc 06 §"Data endpoint". the period, the four
// totals and the flights block; the two blocks it does not serve yet are named below rather
// than sent as empty arrays.

export type ReportPayload = {
  success: true
  data: {
    period_dates: { from: string; to: string }
    total_flights: number
    total_flight_minutes: number
    total_flight_hours: number
    active_pilots: number
    flights: FlightReportRow[]
  }
}

// the oracle paths this endpoint does not serve yet. served as an empty array they would
// read as "this operator has no pilots and no airframes", which is a gap reading as a fact -
// so they are absent and declared, and tests/contracts/report-flight-shape.test.ts fails if
// any *other* oracle path goes unserved. the list shrinks as R2 and R3 land.
export const pendingBlocks = ['data.pilots', 'data.devices'] as const

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

export function reportPayload(
  entries: readonly FlightReportEntry[],
  selection: FlightSelection,
): ReportPayload {
  const seconds = entries.reduce((total, entry) => total + (entry.totalFlightTimeSeconds ?? 0), 0)

  // distinct pilots with at least one flight in the period, counted by id: an unassigned
  // flight names nobody and so contributes to no count, which is the honest answer rather
  // than a pilot invented to hold it.
  const pilots = new Set(entries.map((entry) => entry.pilotId).filter((id) => id !== null))

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
      flights: entries.map((entry) =>
        flightReportRow({
          flight: entry,
          pilotName: entry.pilotName,
          airframe:
            entry.deviceSerialNumber === null
              ? null
              : { serialNumber: entry.deviceSerialNumber, model: entry.deviceModel },
          deviceType: { maxVlos: entry.deviceMaxVlos },
          firstLegStartedAt: entry.firstLegStartedAt,
        }),
      ),
    },
  }
}
