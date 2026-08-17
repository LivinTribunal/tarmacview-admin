import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IndexTable } from '@/components/index-table'
import { formatCell } from '@/lib/table/view'
import { organizationTable, organizationTableRow } from '@/lib/organizations/fields'
import type { OrganizationEntry } from '@/lib/tenant/scoped-organizations'

// docs/specs/04-admin-resources.md §OrganizationResource, asserted as a declaration.
// deliberately not in tests/contracts/: there is no extracted column oracle, only the
// prose, and filing this beside the form contract would read as one.
//
// the last block renders, because `Logo` is the one cell in this register whose meaning is
// not readable off the row: the declaration and the chrome each hold half of it.

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

  it('declares the one row action whose route is now served', () => {
    // `Správa organizácie` is the doc-05 workspace, which this slice serves - so the
    // register reaches it, and `/admin/organizations` joins the `registers` prefix list
    // in tests/contracts/routes.test.ts. `Home Page` is the operator report and is still
    // unserved, so it stays undeclared rather than being a live 404.
    //
    // `{id}` and not `{org}`: rowPath() substitutes `{id}` and only `{id}`, while the
    // oracle spells the route `{org}` and the served directory is therefore `[org]`.
    expect(organizationTable.editPath).toBe('/admin/organizations/{id}/edit')
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

describe('the logo cell, which is a file and not a value', () => {
  const markup = (organization: OrganizationEntry) =>
    renderToStaticMarkup(
      createElement(IndexTable, {
        declaration: organizationTable,
        rows: [organizationTableRow(organization)],
      }),
    )

  it('carries the organisation name in the cell and the stored path nowhere', () => {
    // the path is the disk's layout. nothing on the page needs it, and handing it to the
    // browser would publish the shape of the storage root for free
    const row = organizationTableRow(entry)
    expect(row.logo_path).toBe('Operator Placeholder')
    expect(markup(entry)).not.toContain('organization-logos')
  })

  it('renders an image at the route the column declares, announced by the organisation name', () => {
    expect(markup(entry)).toContain(
      '<img src="/api/organizations/4/logo" alt="Operator Placeholder"/>',
    )
  })

  it('renders the blank marker where no logo is stored, rather than an image at nothing', () => {
    const without = { ...entry, logoPath: null }
    expect(organizationTableRow(without).logo_path).toBeNull()
    expect(markup(without)).not.toContain('<img')
  })
})
