import type { CatalogueEntry } from '@/lib/device-types/catalogue'
import type { FormField } from '@/lib/form/fields'
import type { TableDeclaration, TableRow } from '@/lib/table/view'

// the device-type form declared once, rendered by both create and edit.
// contracts/forms/device-types.json is the oracle for this list - the constraints are a
// client-side floor, never the server rule set.
export const deviceTypeFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'deviceType.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'max_vlos',
    control: 'input',
    labelKey: 'deviceType.field.max_vlos',
    type: 'number',
    step: 0.01,
  },
  {
    name: 'service_interval',
    control: 'input',
    labelKey: 'deviceType.field.service_interval',
    type: 'number',
    min: 0,
    step: 1,
  },
  {
    name: 'service_interval_months',
    control: 'input',
    labelKey: 'deviceType.field.service_interval_months',
    type: 'number',
    min: 1,
    step: 1,
  },
  {
    name: 'battery_service_interval',
    control: 'input',
    labelKey: 'deviceType.field.battery_service_interval',
    type: 'number',
    min: 0,
    step: 1,
  },
  {
    name: 'maintenance_instructions',
    control: 'textarea',
    labelKey: 'deviceType.field.maintenance_instructions',
    maxlength: 65535,
    rows: 5,
  },
]

// the index, declared the same way. docs/specs/04-admin-resources.md §DeviceTypeResource
// is the source: seven columns, every one of them marked `^` sortable, none marked
// *(toggle)*. five of them reuse the form's labels rather than restating them.
//
// no bulk action is declared. `Odstrániť vybrané` is Observed, but the capture was
// GET-only and no write path exists yet, and checkboxes wired to nothing are worse than
// no checkboxes. `Zobraziť` is likewise Observed and likewise not declared: no
// /admin/device-types/{id} path is served, so the row action would be a live 404.
export const deviceTypeTable: TableDeclaration = {
  resource: 'device-types',
  emptyKey: 'deviceType.index.empty',
  editPath: '/admin/device-types/{id}/edit',
  columns: [
    { key: 'id', labelKey: 'deviceType.column.id', sortable: true },
    { key: 'name', labelKey: 'deviceType.field.name', sortable: true },
    { key: 'max_vlos', labelKey: 'deviceType.field.max_vlos', sortable: true },
    { key: 'service_interval', labelKey: 'deviceType.field.service_interval', sortable: true },
    {
      key: 'service_interval_months',
      labelKey: 'deviceType.field.service_interval_months',
      sortable: true,
    },
    {
      key: 'battery_service_interval',
      labelKey: 'deviceType.field.battery_service_interval',
      sortable: true,
    },
    { key: 'devices', labelKey: 'deviceType.column.devices', sortable: true },
  ],
}

// flattens a catalogue entry into the record the chrome renders. numbers stay numbers,
// so the sort is numeric and the decimal comma is applied once, on the way to the
// screen. `max_vlos` is numeric in the database and arrives as a string.
export function deviceTypeTableRow(entry: CatalogueEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    max_vlos: entry.maxVlos === null ? null : Number(entry.maxVlos),
    service_interval: entry.serviceInterval,
    service_interval_months: entry.serviceIntervalMonths,
    battery_service_interval: entry.batteryServiceInterval,
    devices: entry.airframeCount,
  }
}
