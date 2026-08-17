import type { FormField } from '@/lib/form/fields'
import { formatDate, t } from '@/lib/i18n'
import type { MapEntry } from '@/lib/maps/register'
import type { TableDeclaration, TableRow } from '@/lib/table/view'

// the map form declared once, rendered by both create and edit.
// contracts/forms/maps.json is the oracle for this list and it is the whole form: four
// fields, the same set on create and on edit. the order is doc 04 §MapResource's two
// sections - *Základné informácie* first, *Organizácie* last.
//
// two of the four are control shapes no register needed until now, and both are the
// oracle's rather than the prose's. doc 04 and doc 08 both call `Organizácie` a searchable
// multi-select; the captured markup is checkboxes, and contracts/** is never edited to
// agree with a document.
//
// `allow_dark_basemap_toggle` keeps the captured wire name where the column is
// `allow_dark_basemap` - the same rule the people register's `license_number` follows.
export const mapFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'map.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'slug',
    control: 'input',
    labelKey: 'map.field.slug',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'allow_dark_basemap_toggle',
    control: 'button',
    labelKey: 'map.field.allow_dark_basemap',
    type: 'button',
  },

  // no options, for the reason the flight register's `pilot_id` declares none: the choices
  // are the organisations the acting session may read, which is a scoped query the write
  // path will need and nothing here has. so it renders a labelled group with no boxes in
  // it, which is honest about there being nothing to pick yet.
  {
    name: 'organizations',
    control: 'input',
    labelKey: 'map.field.organizations',
    type: 'checkbox',
  },
]

// the index, declared the same way. docs/specs/04-admin-resources.md §MapResource is the
// source: five columns of which `ID`, `Názov` and `Slug` carry `^` and so are the sortable
// three, plus the one it marks *(toggle)*, `created_at`, which is last here and hidden until
// a reader enables it.
//
// no filters and no bulk action, following all seven siblings. `Otvoriť mapu` and
// `Duplikovať` are Observed row actions and neither is declared: the viewer and the clone
// are their own features, so both would link at a route this slice does not serve.
//
// `Upraviť` is offered only to a session that could complete it, which is why this is a
// function - the shape the people register uses, and mayManageMaps in
// src/lib/auth/capabilities.ts holds why.
export function mapTable(mayManage: boolean): TableDeclaration {
  return {
    resource: 'maps',
    emptyKey: 'map.index.empty',
    editPath: mayManage ? '/admin/maps/{id}/edit' : undefined,
    columns: [
      { key: 'id', labelKey: 'map.column.id', sortable: true },
      { key: 'name', labelKey: 'map.field.name', sortable: true },
      { key: 'slug', labelKey: 'map.field.slug', sortable: true },
      { key: 'dark_basemap', labelKey: 'map.column.dark_basemap' },
      { key: 'kml_files', labelKey: 'map.column.kml_files' },
      { key: 'created_at', labelKey: 'map.column.created_at', hiddenByDefault: true },
    ],
  }
}

// flattens a map into the record the chrome renders.
//
// `Tmavá mapa` states the affirmative and says nothing where the flag is clear, the rule
// docs/specs/05-organization-workspace.md §"`Hlavná` renders the flag and never a negative"
// sets out - `allow_dark_basemap` is the same `not null default false` shape as
// `is_primary_contact` and `is_public`, and carries no more than they do.
//
// `Na mape` stays the number it is, so the count of a map with no layers reads as `0` rather
// than as a gap - there is nothing missing about a map nothing has been uploaded to yet.
export function mapTableRow(entry: MapEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    dark_basemap: entry.allowDarkBasemap ? t('map.darkBasemap.yes') : null,
    kml_files: entry.layerCount,
    created_at: formatDate(entry.createdAt),
  }
}
