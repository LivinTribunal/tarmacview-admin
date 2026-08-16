import { describe, expect, it } from 'vitest'
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
  trainingCount: 2,
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

  it('states the usage count, which was blank only while there was no relation to count', () => {
    // `training` exists now, so a `0` is a fact rather than a claim the slice could not
    // make - src/lib/tenant/scoped-training-types.ts counts it under the training policy
    expect(trainingTypeTableRow(entry).trainings).toBe(2)
    expect(trainingTypeTableRow({ ...entry, trainingCount: 0 }).trainings).toBe(0)
  })

  it('leaves an absent description blank rather than empty text', () => {
    expect(trainingTypeTableRow({ ...entry, description: null }).description).toBeNull()
  })
})
