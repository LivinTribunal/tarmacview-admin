import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { formatCell } from '@/lib/table/view'
import type { PersonEntry } from '@/lib/tenant/scoped-people'
import { personTable, personTableRow } from '@/lib/users/fields'

// docs/specs/04-admin-resources.md §UserResource, asserted as a declaration. deliberately
// not in tests/contracts/, for the reason organization-columns.test.ts gives: there is no
// extracted column oracle, only the prose.
//
// every value below is invented, as tests/support/fixtures.ts says. this register's real
// subject matter is pilots' names, e-mail addresses and certificate numbers.

const entry: PersonEntry = {
  id: 7,
  name: 'Placeholder Pilot',
  email: 'placeholder.pilot@example.invalid',
  systemRole: 'member',
  certificateNumber: 'CERT-PLACEHOLDER-0007',
  certificateTypes: ['A1_A3', 'A2'],
  certificateValidUntil: '2027-06-30',
  // neither carries a column in this register - they are the workspace's, doc 05 §0
  phoneNumber: null,
  position: null,
  createdAt: new Date('2026-08-16T00:00:00Z'),
  organizations: ['Operator Alpha', 'Operator Bravo'],
  roles: ['pilot', 'operations'],
}

describe('people index columns', () => {
  it('declares the six columns the spec lists, in order', () => {
    expect(personTable(true).columns.map((column) => column.key)).toEqual([
      'id',
      'name',
      'email',
      'certificate_number',
      'organization',
      'roles',
    ])
  })

  it('marks sortable exactly the three columns carrying `^`', () => {
    expect(
      personTable(true)
        .columns.filter((column) => column.sortable)
        .map((column) => column.key),
    ).toEqual(['id', 'organization', 'roles'])
  })

  it('declares no bulk action, which doc 04 records for this resource as `Bulk: none`', () => {
    expect(personTable(true).bulkActionKey).toBeUndefined()
  })

  it('offers `Upraviť` to a session that could complete it', () => {
    expect(personTable(true).editPath).toBe('/admin/users/{id}/edit')
  })

  it('offers no row action to one that could not, rather than letting postgres refuse', () => {
    // writes on `person` are superadmin-only in the database and the matrix is wider -
    // mayManagePeople in src/lib/auth/capabilities.ts, and #48 closes the gap.
    expect(personTable(false).editPath).toBeUndefined()
  })
})

describe('people index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = personTableRow(entry)
    for (const column of personTable(true).columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('keeps the organisation and the role as two cells, aligned element by element', () => {
    // the person holds `pilot` under Alpha and `operations` under Bravo. one cell pairing
    // them would state a relation the register could not be read back out of; two cells in
    // one shared order can.
    const row = personTableRow(entry)
    expect(row.organization).toBe('Operator Alpha, Operator Bravo')
    expect(row.roles).toBe(
      `${t('person.organizationRole.pilot')}, ${t('person.organizationRole.operations')}`,
    )
  })

  it('renders the roles through the locale rather than as stored enum values', () => {
    expect(personTableRow(entry).roles).not.toContain('accountable_manager')
    expect(personTableRow({ ...entry, roles: ['accountable_manager'] }).roles).toBe(
      t('person.organizationRole.accountable_manager'),
    )
  })

  it('leaves a null e-mail blank rather than rendering an empty string', () => {
    // a pilot with no e-mail is the normal case for this register - CONTEXT.md §People
    const row = personTableRow({ ...entry, email: null })
    expect(row.email).toBeNull()
    expect(formatCell(row.email ?? null)).toBeNull()
  })

  it('leaves an unrecorded certificate number blank', () => {
    expect(personTableRow({ ...entry, certificateNumber: null }).certificate_number).toBeNull()
  })

  it('keeps a person with no readable membership in the register, with both cells blank', () => {
    // dropping them would hide the people only a superadmin can see, which is the register
    // failing exactly where it is the only evidence there is.
    const row = personTableRow({ ...entry, organizations: null, roles: null })
    expect(row.id).toBe(entry.id)
    expect(row.organization).toBeNull()
    expect(row.roles).toBeNull()
  })

  it('gives the system role no column of its own, because doc 04 lists none', () => {
    // it is a third axis: deployment-wide authority, and neither of the two membership
    // columns. a cell for it here would collapse axes the register keeps apart.
    expect(personTable(true).columns.map((column) => column.key)).not.toContain('system_role')
    expect(personTableRow(entry)).not.toHaveProperty('system_role')
  })
})
