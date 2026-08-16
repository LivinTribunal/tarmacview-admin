import type { FormField } from '@/lib/form/fields'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { TrainingTypeEntry } from '@/lib/tenant/scoped-training-types'

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

// the usage count is a real count now that `training` exists - listTrainingTypes in
// src/lib/tenant/scoped-training-types.ts counts it inside the tenant transaction. it was
// null while there was no relation to count, because a `0` would have asserted a fact the
// slice could not know; a `0` here is that fact, and it is the count a member's own policy
// admits rather than the deployment's.
export function trainingTypeTableRow(entry: TrainingTypeEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    code: entry.code,
    description: entry.description,
    trainings: entry.trainingCount,
  }
}
