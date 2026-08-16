import type { FormField } from '@/lib/form/fields'
import { formatDate, t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { TrainingEntry } from '@/lib/tenant/scoped-trainings'

// the training form declared once, rendered by both create and edit.
// contracts/forms/trainings.json is the oracle for this list.
//
// `date_start` and `date_end` keep the contract's spelling the way the people register
// keeps `licence_type_ids`: a captured `name` attribute is the wire name of a rendered
// form, and the oracle is never edited to agree with us. the rebuild's columns are
// `held_on` and `valid_until` - docs/specs/03-data-model.md §"Trainings in the rebuild" -
// and the labels a reader sees are doc 04's.
//
// `Pilot` carries `required` from doc 04 §TrainingResource rather than from the contract,
// which records no attribute for it. same footing as `Roly` in src/lib/users/fields.ts.
//
// the three selects carry no options: the choices are the syllabus entries, people and
// airframes the acting session may read, which are scoped queries the write path will need
// and nothing here has.
export const trainingFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'training.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'training_type_id',
    control: 'select',
    labelKey: 'training.field.training_type',
  },
  {
    name: 'pilot_id',
    control: 'select',
    labelKey: 'training.field.pilot',
    required: true,
  },
  {
    name: 'devices',
    control: 'select',
    labelKey: 'training.field.devices',
    multiple: true,
  },
  {
    name: 'date_start',
    control: 'input',
    labelKey: 'training.field.held_on',
    type: 'date',
  },
  {
    name: 'date_end',
    control: 'input',
    labelKey: 'training.field.valid_until',
    type: 'date',
  },
]

// docs/specs/04-admin-resources.md §TrainingResource is the source: seven columns, of which
// `Zariadenia` alone carries no `^` and so alone is not sortable.
//
// no `Vytvoriť` header link and no bulk action, following the device-type, organisation and
// training-type registers: doc 04 records `Odstrániť vybrané`, but no write path exists in
// the rebuild and a checkbox wired to nothing is worse than no checkbox. the *(toggle)*
// columns doc 04 lists are left out too, matching the column list issue #51 states.
export const trainingTable: TableDeclaration = {
  resource: 'trainings',
  emptyKey: 'training.index.empty',
  editPath: '/admin/trainings/{id}/edit',
  columns: [
    { key: 'id', labelKey: 'training.column.id', sortable: true },
    { key: 'name', labelKey: 'training.field.name', sortable: true },
    { key: 'training_type', labelKey: 'training.field.training_type', sortable: true },
    { key: 'pilot', labelKey: 'training.field.pilot', sortable: true },
    { key: 'devices', labelKey: 'training.field.devices' },
    { key: 'held_on', labelKey: 'training.field.held_on', sortable: true },
    { key: 'valid_until', labelKey: 'training.field.valid_until', sortable: true },
  ],
}

// flattens a training into the record the chrome renders.
//
// a blank `Platnosť do` is **not** a blank cell. doc 04 reads it *Bez expirácie*, so a null
// resolves the never-expires string - a training that never lapses and a training whose
// expiry nobody recorded are different facts, and only one of them is a gap. `Dátum
// školenia` and an unclassified `Typ` keep the locale's blank marker, which is what a gap
// looks like everywhere else in the chrome.
export function trainingTableRow(entry: TrainingEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    training_type: entry.trainingTypeName,
    pilot: entry.pilotName,
    devices: entry.airframes?.join(', ') ?? null,
    held_on: formatDate(entry.heldOn),
    valid_until:
      entry.validUntil === null ? t('training.validUntil.never') : formatDate(entry.validUntil),
  }
}
