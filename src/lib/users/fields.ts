import type { FormField } from '@/lib/form/fields'
import { t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { PersonEntry } from '@/lib/tenant/scoped-people'

// the people form declared once, rendered by both create and edit.
// contracts/forms/users.json is the oracle for this list.
//
// the one divergence in the rebuild so far, and it is deliberate. a `name` attribute is
// the captured wire name of a rendered form, so it belongs to the oracle and is copied
// verbatim - `license_number`, `licence_valid_to` and `licence_type_ids`, the typo
// included. everything a reader ever sees says *osvedčenie*: the columns are
// `certificate_number`, `certificate_types` and `certificate_valid_until`, and so are the
// message keys. CONTEXT.md §"Certification & training" is why, and the oracle is never
// edited to agree with us.
//
// `Roly` carries `required` from doc 04 §UserResource rather than from the contract - the
// capture records no attribute for it, and the contract is a floor rather than the whole
// rule set.
export const personFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'person.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },

  // optional, and that is the pilot register rather than an oversight - CONTEXT.md
  // §People. a required or unconditionally unique e-mail makes the common case impossible.
  {
    name: 'email',
    control: 'input',
    labelKey: 'person.field.email',
    type: 'email',
    maxlength: 255,
  },

  // no options: the choices are the organisations the acting session may read, which is a
  // scoped query the write path will need and nothing here has. the renderer's own
  // "Nevybrané" choice stands alone rather than a list invented at build time.
  {
    name: 'organization_id',
    control: 'select',
    labelKey: 'person.field.organization',
  },
  {
    name: 'password',
    control: 'input',
    labelKey: 'person.field.password',
    type: 'password',
    minlength: 8,
    maxlength: 255,
  },
  {
    name: 'password_confirmation',
    control: 'input',
    labelKey: 'person.field.password_confirmation',
    type: 'password',
    minlength: 8,
    maxlength: 255,
  },
  {
    name: 'roles',
    control: 'select',
    labelKey: 'person.field.roles',
    required: true,
    multiple: true,
    options: [
      { value: 'accountable_manager', labelKey: 'person.organizationRole.accountable_manager' },
      { value: 'operations', labelKey: 'person.organizationRole.operations' },
      { value: 'pilot', labelKey: 'person.organizationRole.pilot' },
      { value: 'viewer', labelKey: 'person.organizationRole.viewer' },
    ],
  },

  // *Osvedčenia*, doc 04's second section
  {
    name: 'license_number',
    control: 'input',
    labelKey: 'person.field.certificate_number',
    type: 'text',
  },
  {
    name: 'licence_type_ids',
    control: 'select',
    labelKey: 'person.field.certificate_types',
    multiple: true,
    options: [
      { value: 'A1_A3', labelKey: 'person.certificateType.A1_A3' },
      { value: 'A2', labelKey: 'person.certificateType.A2' },
      { value: 'STS', labelKey: 'person.certificateType.STS' },
    ],
  },
  {
    name: 'licence_valid_to',
    control: 'input',
    labelKey: 'person.field.certificate_valid_until',
    type: 'date',
  },
]

// docs/specs/04-admin-resources.md §UserResource is the source: six columns, of which `ID`,
// `Organizácia` and `Roly` carry `^` and so are the sortable three. no *(toggle)* column
// and no bulk action - doc 04 records `Bulk: none` for this resource alone, so here the
// absence is the observation rather than the missing write path the sibling registers cite.
//
// certificate *types* carry no column in doc 04 and get none here. an empty array is a gap
// and never a pass, and that rule lives on the schema and in doc 03, where no rendering
// decision can lose it.
//
// `Upraviť` is offered only to a session that could complete it, which is why this is a
// function. doc 04's row action and its `Vytvoriť` header need the write authority the
// database holds at superadmin, and chrome a member can click and cannot finish is worse
// than absent chrome - mayManagePeople in src/lib/auth/capabilities.ts.
export function personTable(mayManage: boolean): TableDeclaration {
  return {
    resource: 'users',
    emptyKey: 'person.index.empty',
    editPath: mayManage ? '/admin/users/{id}/edit' : undefined,
    columns: [
      { key: 'id', labelKey: 'person.column.id', sortable: true },
      { key: 'name', labelKey: 'person.column.name' },
      { key: 'email', labelKey: 'person.field.email' },
      { key: 'certificate_number', labelKey: 'person.field.certificate_number' },
      { key: 'organization', labelKey: 'person.column.organization', sortable: true },
      { key: 'roles', labelKey: 'person.column.roles', sortable: true },
    ],
  }
}

// flattens a person into the record the chrome renders.
//
// `Organizácia` and `Roly` stay two cells over the same membership rows: a person may hold
// `pilot` under one operator and `operations` under another, and the two aggregates arrive
// in one shared order so element *n* of each describes the same attachment. one cell
// pairing them would state a relation the register could not then be read back out of.
//
// a person with no membership the session can read keeps both cells blank rather than
// dropping out of the register, and a null e-mail renders the locale's blank marker the
// same way an airframe with no device type does. `system_role` is a third axis with no
// column in doc 04 and none here.
export function personTableRow(entry: PersonEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    email: entry.email,
    certificate_number: entry.certificateNumber,
    organization: entry.organizations?.join(', ') ?? null,
    roles: entry.roles?.map((role) => t(`person.organizationRole.${role}`)).join(', ') ?? null,
  }
}
