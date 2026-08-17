import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { formatCell } from '@/lib/table/view'
import { mapTable, mapTableRow } from '@/lib/maps/fields'

// docs/specs/04-admin-resources.md §MapResource, asserted as a declaration - filed beside
// device-type-columns.test.ts and for the reason it gives: there is no extracted column
// oracle, only the prose.

const entry = {
  id: 4,
  name: 'Placeholder Geozones',
  slug: 'placeholder-geozones',
  allowDarkBasemap: true,
  createdAt: new Date('2026-08-17T00:00:00Z'),
  layerCount: 63,
}

describe('map index columns', () => {
  it('declares the columns the spec lists, in order', () => {
    expect(mapTable(true).columns.map((column) => column.key)).toEqual([
      'id',
      'name',
      'slug',
      'dark_basemap',
      'kml_files',
      'created_at',
    ])
  })

  it('marks the three the spec marks `^` sortable, and no others', () => {
    expect(
      mapTable(true)
        .columns.filter((column) => column.sortable)
        .map((column) => column.key),
    ).toEqual(['id', 'name', 'slug'])
  })

  it('hides the one column the spec marks *(toggle)* until a reader enables it', () => {
    expect(
      mapTable(true)
        .columns.filter((column) => column.hiddenByDefault)
        .map((column) => column.key),
    ).toEqual(['created_at'])
  })

  it('declares no filters and no bulk action', () => {
    expect(mapTable(true).filters).toBeUndefined()
    expect(mapTable(true).bulkActionKey).toBeUndefined()
  })

  it('points its row action at a route that is actually served, and only for a session that could complete it', () => {
    // `Otvoriť mapu` and `Duplikovať` are Observed row actions and neither is declared: the
    // viewer and the clone are their own features, and a row action with no served route is
    // a live 404
    expect(mapTable(true).editPath).toBe('/admin/maps/{id}/edit')
    expect(mapTable(false).editPath).toBeUndefined()
  })
})

describe('map index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = mapTableRow(entry)
    for (const column of mapTable(true).columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('keeps the layer count as the number it is, so the column sorts numerically', () => {
    expect(mapTableRow(entry).kml_files).toBe(63)
  })

  it('reads a map with no layers as none rather than as a gap', () => {
    const row = mapTableRow({ ...entry, layerCount: 0 })
    expect(row.kml_files).toBe(0)
    expect(formatCell(row.kml_files ?? null)).toBe('0')
  })

  it('states `Tmavá mapa` where the toggle is offered and says nothing where it is not', () => {
    // `allow_dark_basemap` is `not null default false`, so the column cannot tell "this map
    // deliberately offers no dark basemap" from "nobody ever set one" - the same shape and
    // the same rule as `Hlavná` and `Verejné`
    expect(mapTableRow(entry).dark_basemap).toBe(t('map.darkBasemap.yes'))

    const plain = mapTableRow({ ...entry, allowDarkBasemap: false })
    expect(plain.dark_basemap).toBeNull()
    expect(formatCell(plain.dark_basemap ?? null)).toBeNull()
    // and the rest of the row still says which map it is
    expect(plain.name).toBe('Placeholder Geozones')
  })
})
