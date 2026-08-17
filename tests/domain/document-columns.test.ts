import { describe, expect, it } from 'vitest'
import { generalDocumentTable, generalDocumentTableRow } from '@/lib/documents/fields'
import { t } from '@/lib/i18n'
import { formatCell } from '@/lib/table/view'
import type { DocumentEntry } from '@/lib/tenant/scoped-documents'

// docs/specs/04-admin-resources.md §OrganizationDocumentResource, asserted as a
// declaration - the same footing tests/domain/flight-columns.test.ts sits on, and
// deliberately not in tests/contracts/: there is no extracted column oracle, only the prose.
//
// two claims here are the register's half of decisions the schema holds the other half of.
// `Kategória` is the bucket and never a reader's choice, so it prints through the catalogue;
// and a null `Platnosť do` is a gap, never an expiry that passed - the row the database is
// happy to store is the row this must not misreport.

const entry: DocumentEntry = {
  id: 7,
  organizationId: null,
  category: 'general',
  name: 'Placeholder Operations Manual Template',
  filePath: 'general-documents/placeholder-operations-manual.pdf',
  note: 'Placeholder template note.',
  validUntil: null,
  isPublic: false,
  uploadedBy: 3,
  size: 12800,
  createdAt: new Date('2026-08-17T00:00:00Z'),
  uploadedByName: 'Placeholder Administrator',
}

describe('general document index columns', () => {
  it('declares the eight columns the spec lists, in order, and no ID column', () => {
    // the one register in doc 04 whose column list does not open with `ID^`
    expect(generalDocumentTable.columns.map((column) => column.key)).toEqual([
      'name',
      'file',
      'link',
      'size',
      'category',
      'valid_until',
      'uploaded_by',
      'created_at',
    ])
  })

  it('marks sortable only the columns carrying `^`', () => {
    expect(
      generalDocumentTable.columns.filter((column) => !column.sortable).map((column) => column.key),
    ).toEqual(['file', 'link', 'category', 'created_at'])
  })

  it('hides the column doc 04 marks *(toggle)* until a reader enables it', () => {
    expect(
      generalDocumentTable.columns
        .filter((column) => column.hiddenByDefault)
        .map((column) => column.key),
    ).toEqual(['created_at'])
  })

  it('declares no filters and no bulk action', () => {
    expect(generalDocumentTable.filters).toBeUndefined()
    expect(generalDocumentTable.bulkActionKey).toBeUndefined()
  })

  it('points its row action at a route that is actually served', () => {
    expect(generalDocumentTable.editPath).toBe('/admin/general-documents/{id}/edit')
  })

  it('reaches the file through the row id and through nothing else', () => {
    // `Odkaz` renders the serving route for the row - the stored path is not in the
    // declaration, is not in the cell, and cannot reach the browser
    const link = generalDocumentTable.columns.find((column) => column.key === 'link')
    expect(link?.linkPath).toBe('/api/general-documents/{id}/file')
    expect(
      generalDocumentTable.columns.filter((column) => column.linkPath).map((column) => column.key),
    ).toEqual(['link'])
  })
})

describe('general document index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = generalDocumentTableRow(entry)
    for (const column of generalDocumentTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('shows the stored file by its own name and never by the path it sits at', () => {
    expect(generalDocumentTableRow(entry).file).toBe('placeholder-operations-manual.pdf')
  })

  it('leaves `Platnosť do` a gap where no expiry is recorded, and never reads as expired', () => {
    const row = generalDocumentTableRow(entry)
    expect(row.valid_until).toBeNull()
    // the chrome renders the locale's blank marker for a null, so the cell reads as a gap
    expect(formatCell(row.valid_until ?? null)).toBeNull()
    // and the rest of the row still says what the document is
    expect(row.name).toBe('Placeholder Operations Manual Template')
  })

  it('prints a stated expiry in the one format this application prints', () => {
    expect(generalDocumentTableRow({ ...entry, validUntil: '2027-12-31' }).valid_until).toBe(
      '31.12.2027',
    )
  })

  it('prints `Kategória` through the catalogue rather than printing the enum', () => {
    expect(generalDocumentTableRow(entry).category).toBe(t('document.category.general'))
    expect(generalDocumentTableRow({ ...entry, category: 'permits' }).category).toBe(
      t('document.category.permits'),
    )
  })

  it('renders `Veľkosť` human-readable, with the decimal comma a slovak reader types', () => {
    const size = (bytes: number | null) => generalDocumentTableRow({ ...entry, size: bytes }).size

    expect(size(12800)).toBe('12,8 kB')
    expect(size(2400000)).toBe('2,4 MB')
    expect(size(999)).toBe('999 B')
    expect(size(0)).toBe('0 B')
    expect(size(1000)).toBe('1,0 kB')
    expect(size(1000000)).toBe('1,0 MB')
  })

  it('states a missing size as a gap rather than as an empty file', () => {
    expect(generalDocumentTableRow({ ...entry, size: null }).size).toBeNull()
  })

  it('reports a gap in `Nahral` rather than a name the session could not read', () => {
    // the normal case for this register: the library is published by a superadmin, whom no
    // member shares an organisation with
    const row = generalDocumentTableRow({ ...entry, uploadedByName: null })
    expect(row.uploaded_by).toBeNull()
    expect(row.name).toBe('Placeholder Operations Manual Template')
  })

  it('prints `Nahrané` in the one format this application prints', () => {
    expect(generalDocumentTableRow(entry).created_at).toBe('17.08.2026')
  })
})
