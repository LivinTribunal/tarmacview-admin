import type { FormField } from '@/lib/form/fields'
import { formatDate, t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { FlightEntry } from '@/lib/tenant/scoped-flights'

// the flight form declared once, rendered by both create and edit.
// contracts/forms/flights.json is the oracle for this list, and this is the first register
// whose captured create and edit pages do **not** carry the same field set: the create page
// was captured in upload mode, so the manual branch's three measurement fields were never
// in its initial markup - the contract's own note, that a form branch no captured record
// exercises cannot be ruled out. one declaration covers the union, which satisfies *at
// least the captured fields* for both variants.
//
// the field order is doc 04 §FlightResource's form table. `file_hash` and `file_name` are
// hidden inputs the capture recorded; they carry the contract's wire names and no column,
// because nothing computes a hash until the upload path lands (#6).
export const flightFormFields: readonly FormField[] = [
  // the radio doc 04 calls `Spôsob vytvorenia`, offering the three modes a person can pick.
  // the entry-mode enum carries a fourth, `controller_sync`, which no form ever offers -
  // a controller pushes it. docs/specs/07-flight-ingestion.md.
  {
    name: 'entry_mode',
    control: 'input',
    labelKey: 'flight.field.entry_mode',
    type: 'radio',
    options: [
      { value: 'dji_log', labelKey: 'flight.entryMode.dji_log' },
      { value: 'agro_export', labelKey: 'flight.entryMode.agro_export' },
      { value: 'manual', labelKey: 'flight.entryMode.manual' },
    ],
  },
  {
    name: 'file_path',
    control: 'input',
    labelKey: 'flight.field.file',
    type: 'file',
  },
  { name: 'file_name', control: 'input', type: 'hidden' },
  { name: 'file_hash', control: 'input', type: 'hidden' },

  // no options on either select: the choices are the people and airframes the acting
  // session may read, which are scoped queries the write path will need and nothing here
  // has. both are optional, because a flight with neither is normal.
  {
    name: 'pilot_id',
    control: 'select',
    labelKey: 'flight.field.pilot',
  },
  {
    name: 'device_id',
    control: 'select',
    labelKey: 'flight.field.device',
  },

  // text and not `number`, per the capture: doc 04 accepts `1:25` or `1,5`. parsing either
  // into seconds is the write path's job and has no caller yet, and it must accept both
  // decimal separators when it lands.
  {
    name: 'total_flight_time_seconds',
    control: 'input',
    labelKey: 'flight.field.flight_time',
    type: 'text',
  },
  {
    name: 'max_altitude_meters',
    control: 'input',
    labelKey: 'flight.field.max_altitude',
    type: 'number',
    min: 0,
    step: 0.01,
  },

  // the one field here the capture never saw, declared on the contract's at-least floor:
  // maximum distance from the pilot is the figure the VLOS check is judged on, and a form
  // that collects only the track length below cannot state it - docs/specs/03-data-model.md
  // §"Flights in the rebuild".
  {
    name: 'max_distance_meters',
    control: 'input',
    labelKey: 'flight.field.max_distance',
    type: 'number',
    min: 0,
    step: 0.01,
  },
  {
    name: 'total_distance_meters',
    control: 'input',
    labelKey: 'flight.field.total_distance',
    type: 'number',
    min: 0,
    step: 0.01,
  },
]

// docs/specs/04-admin-resources.md §FlightResource is the source: eleven columns, of which
// `Názov súboru`, `Predvolený pilot`, `Predvolené zariadenie (S/N)`, `Stav` and `Importoval`
// carry no `^` and so are the five that are not sortable. the two doc 04 marks *(toggle)*
// are `importedBy.name` and `created_at`, which are the last two columns here, so both are
// offered in the visibility menu and hidden until enabled.
//
// no filters, though doc 04 records `Pilot` and `Zariadenie`: `FilterDef.options` takes a
// static i18n-keyed list and these two need the per-tenant options a scoped query returns.
// widening that shape affects every register and is its own slice. no bulk action either,
// following all five siblings - a checkbox wired to nothing is worse than no checkbox.
export const flightTable: TableDeclaration = {
  resource: 'flights',
  emptyKey: 'flight.index.empty',
  editPath: '/admin/flights/{id}/edit',
  columns: [
    { key: 'id', labelKey: 'flight.column.id', sortable: true },
    { key: 'file_name', labelKey: 'flight.column.file_name' },
    { key: 'pilot', labelKey: 'flight.field.pilot' },
    { key: 'device', labelKey: 'flight.column.device' },
    { key: 'flight_logs', labelKey: 'flight.column.flight_logs', sortable: true },
    { key: 'status', labelKey: 'flight.column.status' },
    { key: 'flight_time', labelKey: 'flight.field.flight_time', sortable: true },
    { key: 'max_altitude', labelKey: 'flight.field.max_altitude', sortable: true },
    { key: 'total_distance', labelKey: 'flight.field.total_distance', sortable: true },
    { key: 'imported_by', labelKey: 'flight.column.imported_by', hiddenByDefault: true },
    {
      key: 'created_at',
      labelKey: 'flight.column.created_at',
      sortable: true,
      hiddenByDefault: true,
    },
  ],
}

// `h:mm`, the form's own format read back out - doc 04 §FlightResource. the seconds under
// the minute are dropped, which is what `h:mm` means; the stored figure keeps them, and it
// is the stored figure a cycle and a service interval are measured against.
//
// this leaves `Čas letu` sorting as text, so 2:00 sorts after 10:05. the date columns
// already sort that way for the same reason - a formatted cell is the only value the row
// carries - and giving the chrome a separate sort value per cell is a change to every
// register rather than to this one.
function flightTime(seconds: number | null): string | null {
  if (seconds === null) return null
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

// flattens a flight into the record the chrome renders.
//
// the three cells that can be blank are blank for two different reasons and neither is a
// pass: a flight may name no pilot and no airframe at all, and one whose pilot or importer
// the session cannot read reports the same gap. `Stav` is blank where nothing was parsed,
// which is the manual-entry case, and shows the failure where a parse failed - a failed
// parse is a record, and this register never filters one out.
//
// `max_altitude` and `total_distance` are numeric in the database and arrive as strings, so
// they go through Number() and formatCell applies the decimal comma once, on the way to the
// screen - the pattern src/lib/device-types/fields.ts records for `max_vlos`.
export function flightTableRow(entry: FlightEntry): TableRow {
  return {
    id: entry.id,
    file_name: entry.fileName,
    pilot: entry.pilotName,
    device: entry.deviceSerialNumber,
    flight_logs: entry.flightLogCount,
    status: entry.parsingStatus === null ? null : t(`flight.parsingStatus.${entry.parsingStatus}`),
    flight_time: flightTime(entry.totalFlightTimeSeconds),
    max_altitude: entry.maxAltitudeMeters === null ? null : Number(entry.maxAltitudeMeters),
    total_distance: entry.totalDistanceMeters === null ? null : Number(entry.totalDistanceMeters),
    imported_by: entry.importedByName,
    created_at: formatDate(entry.createdAt),
  }
}
