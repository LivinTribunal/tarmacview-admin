import type { FormField } from '@/lib/form/fields'
import { t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { OrganizationPersonEntry, PersonEntry } from '@/lib/tenant/scoped-people'

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
// rule set. its *options* come from neither: they are the rebuild's four organisation roles
// and never the predecessor's five combinable global ones, so the multi-select and
// `personTableRow`'s `roles` cell are one axis - docs/specs/09-roles-permissions.md
// §"The people register's `Roly` in the rebuild". how a submitted selection writes
// membership rows is the write path, and is open there rather than guessed here.
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
// than absent chrome - mayManagePeople in src/lib/auth/capabilities.ts. both actions hang
// off that one flag, so the authority decision is stated once per register.
export function personTable(mayManage: boolean): TableDeclaration {
  return {
    resource: 'users',
    emptyKey: 'person.index.empty',
    editPath: mayManage ? '/admin/users/{id}/edit' : undefined,
    createPath: mayManage ? '/admin/users/create' : undefined,
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

// the workspace's two people registers - docs/specs/05-organization-workspace.md §0 and §1.
// filed here rather than in a module of their own because they are the same entity's
// presentation as `personTable` above, and a third home for it is a third place for the
// vocabulary to drift.
//
// each carries its own `emptyKey`. `person.index.empty` reads *Žiadni používatelia*, which
// is the deployment-wide register's sentence and the wrong one under *Piloti*.
//
// **no filter, no row action and no bulk action** on either, the same absence
// `airframeTable` states: doc 05 records `Rola`, `Hlavná kontaktná osoba`, `Upraviť` and
// the two `Odobrať` actions, all Observed from a GET-only capture, and no write path
// exists. Whatever wires `Odobrať` later removes a **membership** and never a person -
// CONTEXT.md §"Attach / detach". Detaching a pilot who has flown would orphan the flight
// history that names them, which is the record this product exists to keep.
//
// `Rola` is singular here where doc 04's `Roly` is plural, and that is the read rather than
// a rename: a tab shows one organisation, and `membership_person_organization_key` gives a
// person at most one membership in it.
export const organizationPersonTable: TableDeclaration = {
  resource: 'organization-people',
  emptyKey: 'organization.workspace.people.empty',
  columns: [
    { key: 'name', labelKey: 'person.column.name' },
    { key: 'role', labelKey: 'person.column.role' },
    { key: 'email', labelKey: 'person.field.email' },
    { key: 'phone_number', labelKey: 'person.column.phone_number' },
    { key: 'position', labelKey: 'person.column.position' },
    { key: 'primary_contact', labelKey: 'person.column.primary_contact' },
  ],
}

export const organizationPilotTable: TableDeclaration = {
  resource: 'organization-pilots',
  emptyKey: 'organization.workspace.pilots.empty',
  columns: [
    { key: 'name', labelKey: 'person.column.name' },
    { key: 'email', labelKey: 'person.field.email' },
    { key: 'certificate_number', labelKey: 'person.field.certificate_number' },
    { key: 'phone_number', labelKey: 'person.column.phone_number' },
  ],
}

// flattens a membership into the record tab 0 renders.
//
// `Hlavná` renders the affirmative where the flag is set and nothing where it is not.
// `is_primary_contact` is `not null default false`, so the column cannot tell "this person
// is not the primary contact" from "nobody ever set one" - a negative word in every row
// would state a fact the column does not carry, and a blank reads as the gap it is.
//
// `Rola` goes through `person.organizationRole.*`, so no role name is written in Slovak
// here and the labels stay shared with the form's own options.
export function organizationPersonTableRow(entry: OrganizationPersonEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    role: t(`person.organizationRole.${entry.role}`),
    email: entry.email,
    phone_number: entry.phoneNumber,
    position: entry.position,
    primary_contact: entry.isPrimaryContact ? t('person.primaryContact.yes') : null,
  }
}

// and tab 1. a pilot with no e-mail, no phone and no certificate keeps every cell blank and
// stays in the register - that is the pilot register's normal row rather than a broken one.
export function organizationPilotTableRow(entry: OrganizationPersonEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    email: entry.email,
    certificate_number: entry.certificateNumber,
    phone_number: entry.phoneNumber,
  }
}
