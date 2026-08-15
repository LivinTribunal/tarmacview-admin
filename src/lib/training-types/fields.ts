import type { TrainingType } from '@/lib/db/schema'
import type { FormField } from '@/lib/form/fields'
import type { TableDeclaration, TableRow } from '@/lib/table/view'

// the training-type form declared once, rendered by both create and edit.
// contracts/forms/training-types.json is the oracle for this list. `Kód` carries no
// length in doc 04 and a maxlength of 255 in the contract, and the contract is the
// oracle.
export const trainingTypeFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'trainingType.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'code',
    control: 'input',
    labelKey: 'trainingType.field.code',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'description',
    control: 'textarea',
    labelKey: 'trainingType.field.description',
    rows: 3,
  },
]

// docs/specs/04-admin-resources.md §TrainingTypeResource is the source: five columns, of
// which `Popis` alone carries no `^` and so alone is not sortable.
//
// no bulk action and no `Zobraziť` row action, for the reasons the device-type register
// gives: the capture was GET-only, no write path exists, and no /admin/training-types/{id}
// path is served, so either one would be chrome wired to nothing.
export const trainingTypeTable: TableDeclaration = {
  resource: 'training-types',
  emptyKey: 'trainingType.index.empty',
  editPath: '/admin/training-types/{id}/edit',
  columns: [
    { key: 'id', labelKey: 'trainingType.column.id', sortable: true },
    { key: 'name', labelKey: 'trainingType.field.name', sortable: true },
    { key: 'code', labelKey: 'trainingType.field.code', sortable: true },
    { key: 'description', labelKey: 'trainingType.field.description' },
    { key: 'trainings', labelKey: 'trainingType.column.trainings', sortable: true },
  ],
}

// the usage count is null, not zero. there is no `training` table yet, so the count is
// over a relation that does not exist and a `0` would assert this type has no trainings -
// a fact this slice cannot know. the chrome renders the blank marker, the same way it does
// for an airframe with no device type. once trainings land the count follows the
// airframe-count precedent in src/lib/device-types/catalogue.ts: counted inside the tenant
// transaction, scoped by the policy.
export function trainingTypeTableRow(entry: TrainingType): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    code: entry.code,
    description: entry.description,
    trainings: null,
  }
}
