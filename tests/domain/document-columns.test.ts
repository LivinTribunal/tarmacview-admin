import { describe, expect, it } from 'vitest'
import {
  generalDocumentTable,
  generalDocumentTableRow,
  organizationDocumentTableRow,
  organizationFormTable,
  organizationOperationsTable,
  organizationPermitTable,
  organizationPermitTableRow,
} from '@/lib/documents/fields'
import { t } from '@/lib/i18n'
import { formatCell, type TableDeclaration } from '@/lib/table/view'
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
    expect(link?.linkPath).toBe('/api/documents/{id}/file')
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

// docs/specs/05-organization-workspace.md §3, §4 and §5 - the workspace's three buckets,
// asserted as declarations the same way the register above is.
//
// the subject of this block is that the three are **not** interchangeable. §4 carries a
// column the other two do not and names its first one differently, so a later editor folding
// them into one declaration over a bucket constant has to break something here to do it.

const bucketEntry: DocumentEntry = {
  ...entry,
  id: 21,
  organizationId: 4,
  category: 'operations',
  name: 'Alpha Operations Manual',
  filePath: 'operations-documents/placeholder-alpha-manual.pdf',
  size: 2400000,
  uploadedByName: 'Placeholder Pilot',
}

const permitEntry: DocumentEntry = {
  ...bucketEntry,
  id: 22,
  category: 'permits',
  // doc 03 §Document: a permit's name **is** its filename
  name: 'placeholder-alpha-permit.pdf',
  filePath: 'permits/placeholder-alpha-permit.pdf',
  isPublic: true,
  size: 51200,
}

const workspaceTables: readonly [string, TableDeclaration][] = [
  ['forms', organizationFormTable],
  ['permits', organizationPermitTable],
  ['operations', organizationOperationsTable],
]

describe('the workspace document tabs declare doc 05 columns, in order', () => {
  it('gives §3 the document shape the doc assumes, which is *(inferred)* and not captured', () => {
    expect(organizationFormTable.columns.map((column) => column.key)).toEqual([
      'name',
      'file',
      'size',
      'uploaded_by',
      'created_at',
    ])
  })

  it('gives §4 `Verejné` and the filename in place of the name, which no other bucket has', () => {
    expect(organizationPermitTable.columns.map((column) => column.key)).toEqual([
      'file',
      'is_public',
      'size',
      'uploaded_by',
      'created_at',
    ])
    expect(organizationPermitTable.columns[0]?.labelKey).toBe('document.column.file_name')
  })

  it('gives §5 the same five columns as §3, from an Observed list rather than a shared one', () => {
    expect(organizationOperationsTable.columns.map((column) => column.key)).toEqual([
      'name',
      'file',
      'size',
      'uploaded_by',
      'created_at',
    ])
  })

  it('keeps `Verejné` off the two buckets doc 05 does not give it', () => {
    // the failure this pins is a shared declaration inventing the flag for a form or an
    // operations manual, where `is_public` is a column of the table and not of the register
    for (const [bucket, declaration] of workspaceTables.filter(([name]) => name !== 'permits')) {
      expect(declaration.columns.map((column) => column.key), bucket).not.toContain('is_public')
    }
  })

  it.each(workspaceTables)(
    '%s reaches its file through the one route and through one column',
    (_, declaration) => {
      // the stored path is not in the declaration, is not in the cell and cannot reach the
      // browser: the chrome is handed a path shape and a row id
      const linked = declaration.columns.filter((column) => column.linkPath)
      expect(linked.map((column) => column.key)).toEqual(['file'])
      expect(linked[0]?.linkPath).toBe('/api/documents/{id}/file')
    },
  )

  it.each(workspaceTables)(
    '%s declares no filter, no bulk action and no row action',
    (_, declaration) => {
      // doc 05 §4 records a `Verejné` filter and it is deferred with the filter panel - the
      // rest are writes, and no write path exists
      expect(declaration.filters).toBeUndefined()
      expect(declaration.bulkActionKey).toBeUndefined()
      expect(declaration.editPath).toBeUndefined()
    },
  )

  it('gives each tab its own empty wording, none of them the register library sentence', () => {
    // *Žiadne dokumenty* is `/admin/general-documents`'s sentence and reads wrong under
    // *Letové povolenia*
    const keys = workspaceTables.map(([, declaration]) => declaration.emptyKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain('document.index.empty')
  })

  it('keys the column-visibility store separately per tab, and apart from the library', () => {
    const resources = [generalDocumentTable, ...workspaceTables.map(([, table]) => table)].map(
      (declaration) => declaration.resource,
    )
    expect(new Set(resources).size).toBe(resources.length)
  })

  it('shows `Nahrané` by default, unlike the register doc 04 marks it *(toggle)* on', () => {
    for (const [bucket, declaration] of workspaceTables) {
      expect(declaration.columns.some((column) => column.hiddenByDefault), bucket).toBe(false)
    }
  })
})

describe('the workspace document tab rows', () => {
  it('carries a cell for every declared column, on all three tabs', () => {
    const rows = [
      [organizationFormTable, organizationDocumentTableRow(bucketEntry)],
      [organizationPermitTable, organizationPermitTableRow(permitEntry)],
      [organizationOperationsTable, organizationDocumentTableRow(bucketEntry)],
    ] as const

    for (const [declaration, row] of rows) {
      for (const column of declaration.columns) {
        expect(row, `${declaration.resource}.${column.key} has no cell`).toHaveProperty(column.key)
      }
    }
  })

  it('shows the stored file by its own name and never by the path it sits at', () => {
    expect(organizationDocumentTableRow(bucketEntry).file).toBe('placeholder-alpha-manual.pdf')
    expect(organizationPermitTableRow(permitEntry).file).toBe('placeholder-alpha-permit.pdf')
  })

  it('gives a permit no `Názov` cell, because its name is the filename already', () => {
    expect(organizationPermitTableRow(permitEntry)).not.toHaveProperty('name')
    expect(organizationDocumentTableRow(bucketEntry).name).toBe('Alpha Operations Manual')
  })

  it('states `Verejné` where the permit is public and says nothing where it is not', () => {
    // `is_public` is `not null default false`, so the column cannot tell "deliberately not
    // public" from "nobody ever ticked it" - and the word belongs on the rows that carry the
    // exposure rather than on the rows that do not
    expect(organizationPermitTableRow(permitEntry).is_public).toBe(t('document.isPublic.yes'))

    const restricted = organizationPermitTableRow({ ...permitEntry, isPublic: false })
    expect(restricted.is_public).toBeNull()
    expect(formatCell(restricted.is_public ?? null)).toBeNull()
    // and the rest of the row still says which permit it is
    expect(restricted.file).toBe('placeholder-alpha-permit.pdf')
  })

  it('renders `Veľkosť` human-readable on both row shapes', () => {
    expect(organizationDocumentTableRow(bucketEntry).size).toBe('2,4 MB')
    expect(organizationPermitTableRow(permitEntry).size).toBe('51,2 kB')
  })

  it('states a missing size as a gap rather than as an empty file', () => {
    expect(organizationDocumentTableRow({ ...bucketEntry, size: null }).size).toBeNull()
    expect(organizationPermitTableRow({ ...permitEntry, size: null }).size).toBeNull()
  })

  it('reports a gap in `Nahral` rather than a name the session could not read', () => {
    // not the normal row here, unlike the global library's: these documents are uploaded by
    // the operator's own people, whom a member of that operator can read. a gap on these
    // tabs means the document names nobody - and it is still a gap and never a pass.
    const row = organizationDocumentTableRow({ ...bucketEntry, uploadedByName: null })
    expect(row.uploaded_by).toBeNull()
    expect(row.name).toBe('Alpha Operations Manual')

    expect(organizationDocumentTableRow(bucketEntry).uploaded_by).toBe('Placeholder Pilot')
  })

  it('prints `Nahrané` in the one format this application prints', () => {
    expect(organizationDocumentTableRow(bucketEntry).created_at).toBe('17.08.2026')
    expect(organizationPermitTableRow(permitEntry).created_at).toBe('17.08.2026')
  })
})
