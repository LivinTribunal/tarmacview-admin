import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { formatCell } from '@/lib/table/view'
import type { TrainingEntry } from '@/lib/tenant/scoped-trainings'
import { trainingTable, trainingTableRow } from '@/lib/trainings/fields'

// docs/specs/04-admin-resources.md §TrainingResource, asserted as a declaration.
// deliberately not in tests/contracts/: there is no extracted column oracle, only the
// prose, and filing this beside the form contract would read as one.

const entry: TrainingEntry = {
  id: 12,
  organizationId: 1,
  name: 'Placeholder Recurrent Training',
  trainingTypeId: 7,
  pilotId: 3,
  heldOn: '2026-03-01',
  validUntil: '2027-03-01',
  createdAt: new Date('2026-08-16T00:00:00Z'),
  trainingTypeName: 'Placeholder Initial Training',
  pilotName: 'Placeholder Pilot',
  airframes: ['SN-PLACEHOLDER-0001'],
}

describe('training index columns', () => {
  it('declares the seven columns the spec lists, in order', () => {
    expect(trainingTable.columns.map((column) => column.key)).toEqual([
      'id',
      'name',
      'training_type',
      'pilot',
      'devices',
      'held_on',
      'valid_until',
    ])
  })

  it('marks every column sortable except `Zariadenia`, which alone carries no `^`', () => {
    expect(
      trainingTable.columns.filter((column) => !column.sortable).map((column) => column.key),
    ).toEqual(['devices'])
  })

  it('declares no toggle column: no `updated_at` exists and `Zariadenia` supersedes `devices_display`', () => {
    expect(trainingTable.columns.some((column) => column.hiddenByDefault)).toBe(false)
  })

  it('declares no filters and no bulk action', () => {
    expect(trainingTable.filters).toBeUndefined()
    // Observed as `Odstrániť vybrané`, but no write path exists and a checkbox wired to
    // nothing is worse than no checkbox
    expect(trainingTable.bulkActionKey).toBeUndefined()
  })

  it('points its row action at a route that is actually served', () => {
    expect(trainingTable.editPath).toBe('/admin/trainings/{id}/edit')
  })
})

describe('training index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = trainingTableRow(entry)
    for (const column of trainingTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('renders the never-expires state rather than a blank cell, which reads as a gap', () => {
    // the predecessor's own string, docs/specs/03-data-model.md §Training: `empty = "Bez
    // expirácie"`. doc 04's *Blank = never expires* is the input rule for the same fact
    const row = trainingTableRow({ ...entry, validUntil: null })
    expect(row.valid_until).toBe(t('training.validUntil.never'))
    expect(formatCell(row.valid_until ?? null)).not.toBeNull()
  })

  it('leaves an unclassified training blank, which is the gap the never-expires case is not', () => {
    const row = trainingTableRow({ ...entry, trainingTypeId: null, trainingTypeName: null })
    expect(row.training_type).toBeNull()
    expect(formatCell(row.training_type ?? null)).toBeNull()
  })

  it('leaves an unrecorded training date blank rather than inventing one', () => {
    expect(trainingTableRow({ ...entry, heldOn: null }).held_on).toBeNull()
  })

  it('joins the airframes into one cell, and leaves a training covering none blank', () => {
    expect(trainingTableRow({ ...entry, airframes: ['A', 'B'] }).devices).toBe('A, B')
    expect(trainingTableRow({ ...entry, airframes: null }).devices).toBeNull()
  })

  it('prints the dates in the one format this application prints', () => {
    expect(trainingTableRow(entry).held_on).toBe('01.03.2026')
  })
})
