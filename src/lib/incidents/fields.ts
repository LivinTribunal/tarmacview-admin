import { formatDate, t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { IncidentEntry } from '@/lib/tenant/scoped-incidents'

// the workspace's occurrence register - docs/specs/05-organization-workspace.md §6, the
// seventh tab and the only one of the seven that needed a **new table in the schema**; the
// other six read tables that already existed.
//
// **the column list is *(inferred)***, and must keep saying so. doc 05 §6 records the
// register as empty for the inspected organisation and says *"Expect at least `Názov` ·
// `Dátum` · `Let` · `Zranenia`"* - so these four are what the doc names and nothing beyond
// them is invented here, the same footing §3's list sits on in src/lib/documents/fields.ts.
//
// no filter, no row action and no bulk action, the same absence every other workspace tab
// states: doc 05 §6 records a `Posledných 30 dní` filter and an `Odstrániť vybrané` bulk
// action, both Observed from a GET-only capture. the filter is deferred with the filter
// panel - and it is not the `Verejné` shape either, since a relative date window is not a
// static option list at all - and the bulk action is a write with no write path.
//
// no `Súbor` column, so nothing here links at `/api/incidents/{id}/file`: doc 05 §6 names no
// such column, `file_path` is nullable so a link on every row would point at a live 404 for
// the reports that carry no file, and inventing the column is what I4 refuses. the route is
// reached by row id and is asserted directly.
export const organizationIncidentTable: TableDeclaration = {
  resource: 'organization-incidents',
  emptyKey: 'organization.workspace.incidents.empty',
  columns: [
    { key: 'title', labelKey: 'incident.column.title' },
    { key: 'incident_date', labelKey: 'incident.column.incident_date' },
    { key: 'flight', labelKey: 'incident.column.flight' },
    { key: 'injuries', labelKey: 'incident.column.injuries' },
  ],
}

// flattens an occurrence report into the record the chrome renders.
//
// **`Zranenia` states three things and not two**, and it is the one cell in the rebuild that
// does. `Hlavná`, `Verejné` and `Tmavá mapa` render the affirmative only, because their
// columns are `not null default false` and so cannot tell *"not this"* from *"nobody ever set
// one"* - doc 05 §"`Hlavná` renders the flag and never a negative". `injuries` is **nullable**
// and can tell them apart, and doc 05 records the exception beside that rule: this cell is an
// answer somebody gave to *"Došlo k zraneniu osôb?"* on a filed report, so a recorded **no**
// is a fact and not a gap. Blanking it would read as *nobody said*, on the one record where
// nobody saying is the thing a reader must be able to see.
//
// `Let` is the linked flight's own display name, and blank where the report names none - doc
// 05 §6 calls the link *optional* and the schema keeps it writable, so the gap is the normal
// row here rather than an incomplete one.
export function organizationIncidentTableRow(entry: IncidentEntry): TableRow {
  return {
    id: entry.id,
    title: entry.title,
    incident_date: formatDate(entry.incidentDate),
    flight: entry.flightFileName,
    injuries:
      entry.injuries === null
        ? null
        : t(entry.injuries ? 'incident.injuries.yes' : 'incident.injuries.no'),
  }
}
