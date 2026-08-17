import { t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { AirframeEntry } from '@/lib/tenant/scoped-airframes'

// the aircraft register, docs/specs/05-organization-workspace.md §2 - the first table
// declaration airframes have had. there is no `/admin/devices` register to put it on: the
// fleet is read inside the organisation workspace and nowhere else.
//
// `Zariadenie` carries the **serial number**. Which field the predecessor put under that
// header was not observable, and the five columns doc 05 records include no separate
// `Sériové číslo` - an aircraft register that never shows the serial is not one a CAMO
// could use, so the header is read as naming the airframe by its identity. That reading is
// Inferred; what settles it for the rebuild is that `Názov zariadenia` is nullable and the
// serial is not, and an identifying column that is blank for the normal case identifies
// nothing.
//
// no row action and no bulk action. doc 05 §2 records `Upraviť` · `Vymazať` ·
// `Vymazať vybrané`, all Observed and all GET-only captures; no airframe route is served
// and no write path exists, so the declaration names neither rather than linking at a live
// 404 - the reason every sibling register states in its own comment. the `Stav` filter is
// left out for the same kind of reason and a different one: it is Observed, and no register
// in this repo declares a filter yet, so the first one to do so is a decision about the
// filter panel rather than about this tab.
//
// `resource` carries the `organization-` prefix its five sibling workspace tabs carry: it is
// the column-visibility key, and a bare `airframes` would be shared with any future
// `/admin/devices` register - src/components/index-table.tsx.
export const airframeTable: TableDeclaration = {
  resource: 'organization-uas',
  emptyKey: 'device.index.empty',
  columns: [
    { key: 'serial_number', labelKey: 'device.column.device' },
    { key: 'model', labelKey: 'device.column.model' },
    { key: 'device_type', labelKey: 'device.column.device_type' },
    { key: 'manufacturer', labelKey: 'device.column.manufacturer' },
    { key: 'status', labelKey: 'device.column.status' },
  ],
}

// flattens an airframe into the record the chrome renders.
//
// `device_type` is never null, and that is the whole point of the cell. an airframe with no
// device type has no VLOS limit and no service interval, so it can never register a
// violation or a service warning - a blank marker there would read as "nothing to say"
// rather than as the gap it is. src/lib/report/device-row.ts states the same thing at the
// report row.
export function airframeTableRow(entry: AirframeEntry): TableRow {
  return {
    id: entry.id,
    serial_number: entry.serialNumber,
    model: entry.model,
    device_type: entry.deviceTypeName ?? t('device.type.unassigned'),
    manufacturer: entry.manufacturer,
    status: t(`device.status.${entry.status}`),
  }
}
