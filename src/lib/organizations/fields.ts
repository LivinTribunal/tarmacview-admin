import type { FormField } from '@/lib/form/fields'
import { formatDate } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { OrganizationEntry } from '@/lib/tenant/scoped-organizations'

// the organisation form declared once. contracts/forms/organizations.json is the oracle
// for this list; the constraints are a client-side floor, never the server rule set.
//
// `accept` is the exception: the contract records none, and PNG/JPG/WebP comes from
// docs/specs/04-admin-resources.md §OrganizationResource, which read it off helper text
// rather than off the attribute. So it is a rebuild decision that agrees with the stated
// rule, not a captured constraint - and the size ceiling is a server rule either way,
// since no attribute can express it.
export const organizationFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'organization.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'logo_path',
    control: 'input',
    labelKey: 'organization.field.logo_path',
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp',
  },
  {
    name: 'uas_registration_number',
    control: 'input',
    labelKey: 'organization.field.uas_registration_number',
    type: 'text',
    maxlength: 255,
  },
  {
    name: 'specific_permit_number',
    control: 'input',
    labelKey: 'organization.field.specific_permit_number',
    type: 'text',
    maxlength: 255,
  },
  {
    name: 'specific_operation_type',
    control: 'select',
    labelKey: 'organization.field.specific_operation_type',
    options: [
      { value: 'VLOS', labelKey: 'organization.operationType.vlos' },
      { value: 'BVLOS', labelKey: 'organization.operationType.bvlos' },
    ],
  },
  {
    name: 'max_allowed_altitude',
    control: 'input',
    labelKey: 'organization.field.max_allowed_altitude',
    type: 'number',
    step: 'any',
  },
  {
    name: 'insurance_valid_until',
    control: 'input',
    labelKey: 'organization.field.insurance_valid_until',
    type: 'date',
  },
  {
    name: 'licence_expiry_warning_days',
    control: 'input',
    labelKey: 'organization.field.licence_expiry_warning_days',
    type: 'number',
    required: true,
    min: 1,
    max: 730,
    step: 'any',
  },
]

// the index, declared the same way. docs/specs/04-admin-resources.md §OrganizationResource
// is the source: six columns visible, six more offered as toggles, and only the five
// carrying `^` are sortable - `Logo` is not, and neither is any toggle.
//
// no row action. `Home Page` reaches the operator report and `Správa organizácie` the org
// workspace (doc 05); neither path is served, and the chrome renders an actions column
// only where one is declared rather than linking at a live 404. no bulk action either,
// for the reason the two sibling registers give: `Vymazať vybrané` is Observed, the
// capture was GET-only, and a checkbox wired to nothing is worse than no checkbox. What
// the delete rule actually is lives in the schema, where no call path can skip it.
export const organizationTable: TableDeclaration = {
  resource: 'organizations',
  emptyKey: 'organization.index.empty',
  columns: [
    { key: 'id', labelKey: 'organization.column.id', sortable: true },
    { key: 'logo_path', labelKey: 'organization.column.logo' },
    { key: 'name', labelKey: 'organization.column.name', sortable: true },
    {
      key: 'uas_registration_number',
      labelKey: 'organization.column.uas_registration_number',
      sortable: true,
    },
    { key: 'people', labelKey: 'organization.column.people', sortable: true },
    { key: 'airframes', labelKey: 'organization.column.airframes', sortable: true },
    {
      key: 'specific_permit_number',
      labelKey: 'organization.field.specific_permit_number',
      hiddenByDefault: true,
    },
    {
      key: 'specific_operation_type',
      labelKey: 'organization.field.specific_operation_type',
      hiddenByDefault: true,
    },
    {
      key: 'max_allowed_altitude',
      labelKey: 'organization.field.max_allowed_altitude',
      hiddenByDefault: true,
    },
    {
      key: 'insurance_valid_until',
      labelKey: 'organization.field.insurance_valid_until',
      hiddenByDefault: true,
    },
    { key: 'created_at', labelKey: 'organization.column.created_at', hiddenByDefault: true },
    { key: 'updated_at', labelKey: 'organization.column.updated_at', hiddenByDefault: true },
  ],
}

// flattens an entry into the record the chrome renders.
//
// two cells are deliberately null. `updated_at` has no column on `organization` and this
// slice does not invent one - a value there would claim a modification time nothing
// maintains. `people` is null under any session the register does not count people for,
// per src/lib/tenant/scoped-organizations.ts. Both render the locale's blank marker, the same
// way an airframe with no device type does.
//
// `logo_path` renders as the stored path. There is no image cell in the chrome, and
// adding one before anything serves the file would be chrome ahead of its subject.
//
// the two dates are the first this application prints, and they go through the locale's
// one format rather than each register picking its own.
export function organizationTableRow(entry: OrganizationEntry): TableRow {
  return {
    id: entry.id,
    logo_path: entry.logoPath,
    name: entry.name,
    uas_registration_number: entry.uasRegistrationNumber,
    people: entry.peopleCount,
    airframes: entry.airframeCount,
    specific_permit_number: entry.specificPermitNumber,
    specific_operation_type: entry.specificOperationType,
    max_allowed_altitude:
      entry.maxAllowedAltitude === null ? null : Number(entry.maxAllowedAltitude),
    insurance_valid_until: formatDate(entry.insuranceValidUntil),
    created_at: formatDate(entry.createdAt),
    updated_at: null,
  }
}
