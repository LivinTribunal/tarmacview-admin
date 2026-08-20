import { formatDate, t } from '@/lib/i18n'
import type { DeviceReportRow } from '@/lib/report/device-row'
import type { FlightReportRow } from '@/lib/report/flight-row'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import { tabHref, type ReportTab } from '@/lib/report/view'
import type { TableDeclaration, TableRow } from '@/lib/table/view'

// the operator report's three registers - one `TableDeclaration` and one row mapper each,
// filed the way the eleven src/lib/<resource>/fields.ts siblings already file theirs.
// src/lib/report/view.ts keeps the *pure half of the page* it is named for: the tiles, the
// warnings and the resolvers that read the query string.
//
// every cell here comes off a key the payload already carries. a second derivation of a
// number the payload holds would drift from it, and the payload's is the one with tests.

// the row link a table declares, as a path shape the chrome substitutes `{id}` into. built
// off `tabHref` so a detail opens on the period the reader is already looking at, and
// appended rather than set through `URLSearchParams`, which would percent-encode the braces.
const detailPath = (submitted: URLSearchParams, tab: ReportTab): string =>
  `${tabHref(submitted, tab)}&detail={id}`

// one cell out of the parts the payload already resolved, absences dropped rather than
// printed. `formatDate` answers null for a null date, so a pilot holding nothing renders the
// status alone - `Bez osvedčenia`, never `Bez osvedčenia` with a null beside it. the empty
// string is dropped with them, because that is what a null `parsing_errors` serialises as.
const composed = (...parts: readonly (string | null)[]): string =>
  parts.filter((part) => part !== null && part !== '').join(', ')

// *Štatistiky pilotov*, the five columns doc 06 §Tables names in its order. the headings are
// Observed slovak and are keyed here in sentence case: the capture's all-caps is appearance,
// and the clean-room line takes the wording and not the styling.
//
// the two keys read the same word as `report.warning.*` in view.ts and stay their own, which
// is the split `trainingStatus`/`certificateStatus` already records: a column heading and a
// lapse's label are two sentences that happen to coincide in slovak today, and sharing one
// would be right by accident.
//
// a declaration rather than a constant, because the row link has to carry the reader's
// period - `personTable(mayManage)` is the same shape for a different reason. no `editPath`
// and no `bulkActionKey`: `TableDeclaration`'s own comment says a resource whose row action
// has no served route declares none rather than linking at a live 404, and a detail is a
// disclosure rather than a route. no column declares `sortable` either - doc 06 captured no
// sort marker on this table, and inventing one is a behaviour nobody observed.
export function pilotReportTable(submitted: URLSearchParams): TableDeclaration {
  return {
    resource: 'report-pilots',
    emptyKey: 'organization.workspace.pilots.empty',
    columns: [
      { key: 'pilot', labelKey: 'report.column.pilot', linkPath: detailPath(submitted, 'pilots') },
      { key: 'flights_count', labelKey: 'report.column.flights' },
      { key: 'total_hours', labelKey: 'report.column.totalTime' },
      { key: 'training', labelKey: 'report.column.training' },
      { key: 'certificate', labelKey: 'report.column.certificate' },
    ],
  }
}

// flattens one payload row into the record the chrome renders. every figure is a key: the
// count is `flights_count` and never `filtered_flights.length`, which agrees with it on every
// real payload and is wrong for the reason this whole split exists.
//
// the two figures stay numbers rather than strings, so the decimal comma comes off
// `formatCell` in the one place the chrome already applies it.
export function pilotReportTableRow(pilot: PilotReportRow): TableRow {
  return {
    id: pilot.id,
    pilot: composed(pilot.name, pilot.email),
    flights_count: pilot.flights_count,
    total_hours: pilot.total_hours,

    // the payload's already-resolved status, never a second derivation of it, and the expiry
    // beside it only where one was stated. a pilot holding nothing renders `Bez školenia` /
    // `Bez osvedčenia` alone, which keeps the gap, the never-expires fact and the
    // valid-with-a-date three answers rather than two.
    training: composed(pilot.training_status, formatDate(pilot.training_date), pilot.training_name),
    certificate: composed(
      pilot.licence_status,
      formatDate(pilot.licence_date),
      pilot.licence_types.join(', '),
    ),
  }
}

// the UAS tab. doc 06 §Tables names its content - *per-airframe totals and service state* -
// and no column list was captured, so the five below are the rebuild's reading of that
// sentence: the airframe's identity, the period's two totals, and the one cell that answers
// the service question.
export function airframeReportTable(submitted: URLSearchParams): TableDeclaration {
  return {
    resource: 'report-uas',
    emptyKey: 'device.index.empty',
    columns: [
      {
        key: 'serial_number',
        labelKey: 'device.column.serial_number',
        linkPath: detailPath(submitted, 'uas'),
      },
      { key: 'model', labelKey: 'device.column.model' },
      { key: 'total_flights', labelKey: 'report.column.flights' },
      { key: 'total_flight_hours', labelKey: 'report.column.totalTime' },
      { key: 'service', labelKey: 'report.column.service' },
    ],
  }
}

// the service cell reads `service_warning` and never `service_due`. that one key already
// resolves three states where the boolean resolves two: the gap names itself, a due service
// names itself, and a service that is not due is null - which the chrome renders as the blank
// marker, per the affirmative-only rule, rather than as a tick.
//
// an airframe with no device type has no VLOS limit and no service interval, so it can never
// register a violation or a service warning. `service_due: false` beside it is *not knowable*
// and not an all-clear, and a cell keyed off the boolean would print the same nothing for
// both.
export function airframeReportTableRow(airframe: DeviceReportRow): TableRow {
  return {
    id: airframe.id,
    serial_number: airframe.serial_number,
    model: airframe.model,
    total_flights: airframe.total_flights,
    total_flight_hours: airframe.total_flight_hours,
    service: airframe.service_warning,
  }
}

// *Lety za vybrané obdobie*, the seven columns doc 06 §Tables names in its order, Observed
// and keyed in sentence case like the pilots table above.
//
// no `linkPath`, no `editPath` and no `bulkActionKey`. `Priradiť` is §Tables' inline fallback
// where `PILOT` or `UAS` is unset and the write behind it is the assignment endpoint's, which
// is not served yet: a button that does nothing tells a reader an action exists. the
// unassigned state renders as the named absence the payload already carries instead.
//
// no column declares `sortable`, for the reason the two tables above give. rows render in
// payload order, which is the read's `order by flight.id`; an ordering, if one is ever added,
// keys off `flight_date_sort` and never re-derives it from `flight_date`.
//
// a constant rather than a declaration taking the query string, which is what the two above
// need only because their row link has to carry the reader's period. this one has no row link.
export const flightReportTable: TableDeclaration = {
  resource: 'report-flights',
  emptyKey: 'flight.index.empty',
  columns: [
    { key: 'status', labelKey: 'report.column.status' },
    { key: 'date', labelKey: 'report.column.date' },
    { key: 'pilot', labelKey: 'report.column.pilot' },
    { key: 'uas', labelKey: 'report.column.uas' },
    { key: 'flight_time', labelKey: 'report.column.flightTime' },
    { key: 'max_altitude', labelKey: 'report.column.maxAltitude' },
    { key: 'distance', labelKey: 'report.column.distance' },
  ],
}

// the VLOS half of `STAV`, three answers where the boolean has two. `has_vlos_violation` is
// false in three situations and only one of them is a pass - doc 06 §"The data endpoint in
// the rebuild" - so the two gaps are read off keys that already exist rather than off a
// fourth key parity forbids inventing.
//
// the airframe is resolved against the rows the page already holds, which is what makes the
// scoping structural: another operator's airframe was never in `data.devices[]` to be found.
// `max_vlos_meters` is null exactly when the airframe has no device type or its type sets
// none, and it is only ever tested for null here - never parsed and never compared.
//
// `max_distance` serialises a null as `0` to hold parity, so a recorded zero and no reading
// at all are the same figure. this reads that as **not judged**: a flight that genuinely flew
// zero metres names a gap it does not have, which is noisy, and the other direction is a gap
// reading as a pass, which is the error doc 06 rules out everywhere.
export function vlosAnswer(
  flight: FlightReportRow,
  airframes: readonly DeviceReportRow[],
): string | null {
  if (flight.has_vlos_violation) return t('report.flight.vlos.violation')

  const limit = airframes.find((airframe) => airframe.id === flight.device_id)?.max_vlos_meters
  if (limit === undefined || limit === null || flight.max_distance === 0) {
    return t('report.flight.vlos.notJudged')
  }

  // judged and inside the limit. affirmative-only: the pass says nothing, and the chrome
  // renders the blank marker over it.
  return null
}

// one row per flight of the period, whatever state it is in. nothing filters on
// `parsing_status`, `pilot_id` or `device_id`: a failed parse is still a record and an
// unassigned flight is still a flight, and both are the rows a reader most needs to see.
//
// `STAV` is one cell carrying two axes - the parsing status with its error, and the VLOS
// answer - kept distinguishable rather than folded into one state, which keeps §Tables' seven
// columns seven. the three measurements stay numbers so the decimal comma comes off
// `formatCell` once, and the date is `flight_date_display`, the payload's own rendering.
export function flightReportTableRow(
  flight: FlightReportRow,
  airframes: readonly DeviceReportRow[],
): TableRow {
  return {
    id: flight.id,
    status: composed(flight.parsing_status, flight.parsing_errors, vlosAnswer(flight, airframes)),
    date: flight.flight_date_display,
    pilot: flight.pilot_name,
    uas: flight.device_serial_number,
    flight_time: flight.flight_hours,
    max_altitude: flight.max_altitude,
    distance: flight.max_distance,
  }
}
