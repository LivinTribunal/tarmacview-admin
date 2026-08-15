import { describe, expect, it } from 'vitest'
import {
  formatCell,
  initialState,
  pageSizes,
  rowPath,
  tableView,
  type TableDeclaration,
  type TableRow,
} from '@/lib/table/view'

// the shared table behaviours from docs/specs/04-admin-resources.md §"Shared table
// behaviour", asserted against the pure view rather than against a rendered dom: search,
// column visibility, sorting, pagination and the filter panel are all decisions about
// which rows and which columns, and none of them needs a browser to be wrong.

const declaration: TableDeclaration = {
  resource: 'test-register',
  emptyKey: 'deviceType.index.empty',
  editPath: '/admin/device-types/{id}/edit',
  columns: [
    { key: 'id', labelKey: 'deviceType.column.id', sortable: true },
    { key: 'name', labelKey: 'deviceType.field.name', sortable: true },
    { key: 'max_vlos', labelKey: 'deviceType.field.max_vlos', sortable: true },
    // not sortable, and hidden until the visibility menu enables it
    { key: 'notes', labelKey: 'deviceType.field.maintenance_instructions', hiddenByDefault: true },
  ],
  filters: [
    {
      key: 'status',
      labelKey: 'device.column.status',
      options: [
        { value: 'Aktívne', labelKey: 'device.status.active' },
        { value: 'Vyradené', labelKey: 'device.status.retired' },
      ],
    },
  ],
}

const rows: readonly TableRow[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `Placeholder ${String(index + 1).padStart(2, '0')}`,
  max_vlos: index === 0 ? null : (index + 1) * 100,
  notes: index === 0 ? 'hidden haystack' : null,
  status: index % 2 === 0 ? 'Aktívne' : 'Vyradené',
}))

const state = (overrides: Partial<ReturnType<typeof initialState>> = {}) => ({
  ...initialState(declaration),
  ...overrides,
})

describe('index table: pagination', () => {
  it('offers the observed page sizes and defaults to 10', () => {
    expect(pageSizes).toEqual([5, 10, 25, 50, 'all'])
    expect(initialState(declaration).pageSize).toBe(10)
  })

  it('pages at the default size and reports the range it is showing', () => {
    const view = tableView(rows, declaration, state())
    expect(view.rows).toHaveLength(10)
    expect(view).toMatchObject({ matched: 12, pageCount: 2, page: 1, from: 1, to: 10 })
  })

  it('carries the remainder onto the last page', () => {
    const view = tableView(rows, declaration, state({ page: 2 }))
    expect(view.rows.map((row) => row.id)).toEqual([11, 12])
    expect(view).toMatchObject({ from: 11, to: 12 })
  })

  it('clamps a page beyond the end rather than showing nothing', () => {
    expect(tableView(rows, declaration, state({ page: 99 })).page).toBe(2)
  })

  it('All returns every matched row on one page', () => {
    const view = tableView(rows, declaration, state({ pageSize: 'all' }))
    expect(view.rows).toHaveLength(12)
    expect(view).toMatchObject({ pageCount: 1, from: 1, to: 12 })
  })

  it('an empty register reports a range of nothing, not a first row', () => {
    expect(tableView([], declaration, state())).toMatchObject({ matched: 0, from: 0, to: 0 })
  })
})

describe('index table: column visibility', () => {
  it('starts with the toggle columns hidden', () => {
    const view = tableView(rows, declaration, state())
    expect(view.columns.map((column) => column.key)).toEqual(['id', 'name', 'max_vlos'])
  })

  it('shows a toggle column once it is enabled', () => {
    const view = tableView(rows, declaration, state({ hidden: [] }))
    expect(view.columns.map((column) => column.key)).toContain('notes')
  })
})

describe('index table: search', () => {
  it('matches across the row from one box, case-insensitively', () => {
    const view = tableView(rows, declaration, state({ search: 'placeholder 03' }))
    expect(view.rows.map((row) => row.id)).toEqual([3])
  })

  it('matches a number as it reads, decimal comma included', () => {
    const decimals: readonly TableRow[] = [
      { id: 1, name: 'Placeholder A', max_vlos: 1.5, notes: null, status: 'Aktívne' },
      { id: 2, name: 'Placeholder B', max_vlos: 500, notes: null, status: 'Aktívne' },
    ]
    expect(tableView(decimals, declaration, state({ search: '1,5' })).rows.map((r) => r.id)).toEqual(
      [1],
    )
  })

  it('does not match on a column the reader cannot see', () => {
    expect(tableView(rows, declaration, state({ search: 'haystack' })).matched).toBe(0)
    expect(tableView(rows, declaration, state({ search: 'haystack', hidden: [] })).matched).toBe(1)
  })
})

describe('index table: sorting', () => {
  it('sorts on a declared sortable column, both directions', () => {
    const ascending = tableView(rows, declaration, state({ sortKey: 'name', pageSize: 'all' }))
    const descending = tableView(
      rows,
      declaration,
      state({ sortKey: 'name', sortDirection: 'desc', pageSize: 'all' }),
    )
    expect(ascending.rows[0]?.id).toBe(1)
    expect(descending.rows[0]?.id).toBe(12)
  })

  it('compares numbers as numbers, so 1000 does not sort before 500', () => {
    const numbers: readonly TableRow[] = [
      { id: 1, name: 'a', max_vlos: 1000, notes: null, status: 'Aktívne' },
      { id: 2, name: 'b', max_vlos: 500, notes: null, status: 'Aktívne' },
    ]
    const view = tableView(numbers, declaration, state({ sortKey: 'max_vlos' }))
    expect(view.rows.map((row) => row.max_vlos)).toEqual([500, 1000])
  })

  it('leaves a blank at the bottom whichever way the column is sorted', () => {
    const ascending = tableView(rows, declaration, state({ sortKey: 'max_vlos', pageSize: 'all' }))
    const descending = tableView(
      rows,
      declaration,
      state({ sortKey: 'max_vlos', sortDirection: 'desc', pageSize: 'all' }),
    )
    // row 1 has no VLOS limit, and an unset limit is a gap rather than the smallest one
    expect(ascending.rows.at(-1)?.id).toBe(1)
    expect(descending.rows.at(-1)?.id).toBe(1)
  })

  it('ignores a sort asked for on a column that does not declare one', () => {
    const view = tableView(rows, declaration, state({ sortKey: 'notes', hidden: [], page: 1 }))
    expect(view.rows.map((row) => row.id)).toEqual(rows.slice(0, 10).map((row) => row.id))
  })
})

describe('index table: filters', () => {
  it('narrows to the selected value and reports the smaller total', () => {
    const view = tableView(
      rows,
      declaration,
      state({ filters: { status: 'Vyradené' }, pageSize: 'all' }),
    )
    expect(view.matched).toBe(6)
    expect(view.rows.every((row) => row.status === 'Vyradené')).toBe(true)
  })

  it('resets to the whole register when the selection is cleared', () => {
    expect(tableView(rows, declaration, state({ filters: { status: '' } })).matched).toBe(12)
  })
})

describe('index table: cells and row paths', () => {
  it('renders a blank as nothing of its own, for the caller to mark', () => {
    expect(formatCell(null)).toBeNull()
  })

  it('renders a decimal with a comma and an integer without a separator', () => {
    expect(formatCell(1.5)).toBe('1,5')
    expect(formatCell(1000)).toBe('1000')
  })

  it('substitutes the row id into the declared path shape', () => {
    expect(rowPath('/admin/device-types/{id}/edit', 7)).toBe('/admin/device-types/7/edit')
  })
})
