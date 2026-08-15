import { describe, expect, it } from 'vitest'
import { formatCell } from '@/lib/table/view'
import { trainingTypeTable, trainingTypeTableRow } from '@/lib/training-types/fields'

// docs/specs/04-admin-resources.md §TrainingTypeResource, asserted as a declaration.
// deliberately not in tests/contracts/: there is no extracted column oracle, only the
// prose, and filing this beside the form contract would read as one.

const entry = {
  id: 7,
  organizationId: 1,
  name: 'Placeholder Initial Training',
  code: 'A1',
  description: 'Placeholder training-type description.',
  createdAt: new Date('2026-08-15T00:00:00Z'),
}

describe('training-type index columns', () => {
  it('declares the five columns the spec lists, in order', () => {
    expect(trainingTypeTable.columns.map((column) => column.key)).toEqual([
      'id',
      'name',
      'code',
      'description',
      'trainings',
    ])
  })

  it('marks every column sortable except `Popis`, which alone carries no `^`', () => {
    expect(
      trainingTypeTable.columns.filter((column) => !column.sortable).map((column) => column.key),
    ).toEqual(['description'])
  })

  it('declares no toggle column, because the spec marks none', () => {
    expect(trainingTypeTable.columns.some((column) => column.hiddenByDefault)).toBe(false)
  })

  it('declares no filters and no bulk action', () => {
    expect(trainingTypeTable.filters).toBeUndefined()
    // Observed as `Odstrániť vybrané`, but no write path exists and a checkbox wired to
    // nothing is worse than no checkbox
    expect(trainingTypeTable.bulkActionKey).toBeUndefined()
  })

  it('points its row action at a route that is actually served', () => {
    expect(trainingTypeTable.editPath).toBe('/admin/training-types/{id}/edit')
  })
})

describe('training-type index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = trainingTypeTableRow(entry)
    for (const column of trainingTypeTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('leaves the usage count blank rather than claiming the type has no trainings', () => {
    // there is no `training` table yet, so the count is over a relation that does not
    // exist. a `0` would assert a fact this slice cannot know; null renders as the
    // locale's blank marker.
    const row = trainingTypeTableRow(entry)
    expect(row.trainings).toBeNull()
    expect(formatCell(row.trainings ?? null)).toBeNull()
  })

  it('leaves an absent description blank rather than empty text', () => {
    expect(trainingTypeTableRow({ ...entry, description: null }).description).toBeNull()
  })
})
