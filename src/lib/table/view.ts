import { defaultLocale, type MessageKey } from '@/lib/i18n'

// the index-table chrome's pure half: visibility, filtering, search, sorting and
// pagination over rows somebody else already fetched. no react and no drizzle here, so
// every behaviour docs/specs/04-admin-resources.md §"Shared table behaviour" describes is
// assertable without a dom and without a container.
//
// ceiling, stated where the decision lives: all of this runs in memory over the whole
// register. it does not survive a resource large enough to matter, and `flights` is the
// one that gets there first. server-side pagination is its own issue rather than
// something pre-built for twelve registers that do not need it.
//
// the operator report's own flights table is not that caller: it is period-filtered and its
// pilot filter narrows the payload rather than the rendered rows, so it is bounded by a month
// rather than by the register.

export type CellValue = string | number | null

// one row as the chrome sees it: flat, serialisable, and already read off whatever
// entity the server component loaded. `id` is the row identity - the bulk checkbox key
// and the subject of the actions link.
export type TableRow = { id: number } & Record<string, CellValue>

export type ColumnDef = {
  key: string
  labelKey: MessageKey
  sortable?: boolean
  // doc 04 marks these *(toggle)*: offered in the visibility menu, hidden until enabled
  hiddenByDefault?: boolean
  // `{id}` substituted per row, the way `editPath` below is. a column declaring one renders
  // that route as an image, and its cell text becomes the image's accessible name
  imagePath?: string
  // the same shape for a file a reader fetches rather than one the page renders - doc 04
  // §OrganizationDocumentResource's `Odkaz`. the cell's text becomes the link's text, so the
  // row id is still the only thing that reaches the url and the stored path never does.
  linkPath?: string
}

export type FilterDef = {
  key: string
  labelKey: MessageKey
  // `value` is matched against the cell as it reads, so an option and the cell it
  // selects are the same text
  options: readonly { value: string; labelKey: MessageKey }[]
}

export type TableDeclaration = {
  // stable per resource: the column-visibility store is keyed off it
  resource: string
  columns: readonly ColumnDef[]
  // what an empty register says, which is the resource's own wording rather than the
  // chrome's
  emptyKey: MessageKey
  // the filter panel, the bulk branch and the trailing actions column render only where
  // a resource declares one. an actions column with nothing in it is chrome pretending
  // there is something to do.
  filters?: readonly FilterDef[]
  bulkActionKey?: MessageKey
  // `{id}` is substituted per row, matching the path shapes in contracts/routes.json.
  // a resource whose row action has no served route declares none rather than linking
  // at a live 404.
  editPath?: string
}

export const pageSizes = [5, 10, 25, 50, 'all'] as const
export type PageSize = (typeof pageSizes)[number]

export type SortDirection = 'asc' | 'desc'

export type TableState = {
  search: string
  filters: Readonly<Record<string, string>>
  sortKey: string | null
  sortDirection: SortDirection
  page: number
  pageSize: PageSize
  hidden: readonly string[]
}

export type TableView = {
  columns: readonly ColumnDef[]
  rows: readonly TableRow[]
  matched: number
  pageCount: number
  page: number
  from: number
  to: number
}

export function initialState(declaration: TableDeclaration): TableState {
  return {
    search: '',
    filters: {},
    sortKey: null,
    sortDirection: 'asc',
    page: 1,
    // doc 04's page-size default, Observed
    pageSize: 10,
    hidden: declaration.columns
      .filter((column) => column.hiddenByDefault)
      .map((column) => column.key),
  }
}

// `{id}` substituted, so a declaration states a path shape rather than shipping a
// function across the server -> client boundary, where a function does not survive.
export function rowPath(path: string, id: number): string {
  return path.replace('{id}', String(id))
}

// a blank cell has no text of its own - the caller renders the locale's blank marker.
// numbers carry a decimal comma, which is what a slovak reader types back in; integers
// stringify without a separator, so the replacement is a no-op for counts and ids.
export function formatCell(value: CellValue): string | null {
  if (value === null) return null
  if (typeof value === 'number') return String(value).replace('.', ',')
  return value
}

const cellText = (row: TableRow, key: string): string => formatCell(row[key] ?? null) ?? ''

// a blank is not the smallest value: it sorts last whichever direction is asked for, so
// an unset field never reads as the top of the register.
function compare(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), defaultLocale)
}

function matchesFilters(row: TableRow, declaration: TableDeclaration, state: TableState): boolean {
  return (declaration.filters ?? []).every((filter) => {
    const selected = state.filters[filter.key]
    return !selected || cellText(row, filter.key) === selected
  })
}

// one box over the whole row, per doc 04. it searches the columns the reader can
// actually see, so a hit is never explained by a hidden column.
function matchesSearch(row: TableRow, visible: readonly ColumnDef[], search: string): boolean {
  const needle = search.trim().toLocaleLowerCase(defaultLocale)
  if (needle === '') return true
  return visible.some((column) =>
    cellText(row, column.key).toLocaleLowerCase(defaultLocale).includes(needle),
  )
}

function sortRows(
  rows: readonly TableRow[],
  visible: readonly ColumnDef[],
  state: TableState,
): readonly TableRow[] {
  const column = visible.find((candidate) => candidate.key === state.sortKey)
  if (!column?.sortable) return rows

  return [...rows].sort((left, right) => {
    const a = left[column.key] ?? null
    const b = right[column.key] ?? null
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
    return state.sortDirection === 'asc' ? compare(a, b) : compare(b, a)
  })
}

export function tableView(
  rows: readonly TableRow[],
  declaration: TableDeclaration,
  state: TableState,
): TableView {
  const visible = declaration.columns.filter((column) => !state.hidden.includes(column.key))
  const matched = rows.filter(
    (row) => matchesFilters(row, declaration, state) && matchesSearch(row, visible, state.search),
  )
  const sorted = sortRows(matched, visible, state)

  const size = state.pageSize === 'all' ? sorted.length : state.pageSize
  const pageCount = size < 1 ? 1 : Math.max(1, Math.ceil(sorted.length / size))
  const page = Math.min(Math.max(state.page, 1), pageCount)
  const start = size < 1 ? 0 : (page - 1) * size
  const pageRows = size < 1 ? sorted : sorted.slice(start, start + size)

  return {
    columns: visible,
    rows: pageRows,
    matched: sorted.length,
    pageCount,
    page,
    from: pageRows.length === 0 ? 0 : start + 1,
    to: start + pageRows.length,
  }
}
