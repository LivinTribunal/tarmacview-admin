import { describe, expect, it } from 'vitest'
import { formatCell } from '@/lib/table/view'
import { organizationTable, organizationTableRow } from '@/lib/organizations/fields'
import type { OrganizationEntry } from '@/lib/tenant/scoped-organizations'

// docs/specs/04-admin-resources.md §OrganizationResource, asserted as a declaration.
// deliberately not in tests/contracts/: there is no extracted column oracle, only the
// prose, and filing this beside the form contract would read as one.

const entry: OrganizationEntry = {
  id: 4,
  name: 'Operator Placeholder',
  logoPath: 'organization-logos/placeholder.png',
  uasRegistrationNumber: 'PLACEHOLDER-REG',
  specificPermitNumber: 'PLACEHOLDER-PERMIT',
  specificOperationType: 'VLOS',
  maxAllowedAltitude: '120.5',
  insuranceValidUntil: '2027-03-09',
  licenceExpiryWarningDays: 40,
  reportToken: 'report-token-placeholder',
  createdAt: new Date('2026-08-15T00:00:00Z'),
  airframeCount: 3,
  peopleCount: 7,
}

describe('organisation index columns', () => {
  it('declares the twelve columns the spec lists, in order', () => {
    expect(organizationTable.columns.map((column) => column.key)).toEqual([
      'id',
      'logo_path',
      'name',
      'uas_registration_number',
      'people',
      'airframes',
      'specific_permit_number',
      'specific_operation_type',
      'max_allowed_altitude',
      'insurance_valid_until',
      'created_at',
      'updated_at',
    ])
  })

  it('hides the six the spec marks *(toggle)* and shows the six it does not', () => {
    expect(
      organizationTable.columns.filter((column) => column.hiddenByDefault).map((c) => c.key),
    ).toEqual([
      'specific_permit_number',
      'specific_operation_type',
      'max_allowed_altitude',
      'insurance_valid_until',
      'created_at',
      'updated_at',
    ])
  })

  it('marks sortable exactly the columns carrying `^`, which `Logo` does not', () => {
    expect(organizationTable.columns.filter((column) => column.sortable).map((c) => c.key)).toEqual(
      ['id', 'name', 'uas_registration_number', 'people', 'airframes'],
    )
  })

  it('declares no row action while neither target route is served', () => {
    // `Home Page` is the operator report and `Správa organizácie` is the doc-05
    // workspace. an actions column here would be a live 404, so organisations also stay
    // out of the `registers` prefix list in tests/contracts/routes.test.ts until then.
    expect(organizationTable.editPath).toBeUndefined()
  })

  it('declares no bulk action, because nothing yet answers one', () => {
    // `Vymazať vybrané` is Observed, but the capture was GET-only and no write path
    // exists. What the delete actually does is a schema rule, proved in
    // tests/tenancy/organization-isolation.test.ts rather than promised by a checkbox.
    expect(organizationTable.bulkActionKey).toBeUndefined()
  })
})

describe('organisation index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = organizationTableRow(entry)
    for (const column of organizationTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('prints both dates in the one format this application holds', () => {
    const row = organizationTableRow(entry)
    expect(row.insurance_valid_until).toBe('09.03.2027')
    expect(row.created_at).toBe('15.08.2026')
  })

  it('leaves the modification time blank rather than inventing one', () => {
    // `organization` has no `updated_at` column and this slice does not add one. a value
    // here would claim a modification time nothing maintains.
    const row = organizationTableRow(entry)
    expect(row.updated_at).toBeNull()
    expect(formatCell(row.updated_at ?? null)).toBeNull()
  })

  it('passes a blank people count through as blank rather than as zero', () => {
    const row = organizationTableRow({ ...entry, peopleCount: null })
    expect(row.people).toBeNull()
  })

  it('renders the altitude as a number, so it sorts numerically and carries a decimal comma', () => {
    expect(formatCell(organizationTableRow(entry).max_allowed_altitude ?? null)).toBe('120,5')
  })
})
