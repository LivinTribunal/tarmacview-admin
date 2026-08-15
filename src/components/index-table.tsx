'use client'

import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import {
  formatCell,
  initialState,
  pageSizes,
  rowPath,
  tableView,
  type PageSize,
  type TableDeclaration,
  type TableRow,
  type TableState,
} from '@/lib/table/view'

// the index chrome, once, for all thirteen registers. it takes rows and a declaration
// and it never queries: no schema type reaches it, so it cannot grow a filter parameter
// a caller could widen a read with. the behaviours are
// docs/specs/04-admin-resources.md §"Shared table behaviour"; the view maths lives in
// src/lib/table/view.ts.

const storageKey = (resource: string) => `tarmacview.table.${resource}.hidden`

// column visibility persists per user - Observed. *where* the predecessor stored it was
// not, so a browser-local store is a rebuild decision rather than an observation
// promoted to a fact; a server-side preference store stays available if one is ever
// needed. reading storage during render would be a hydration mismatch, so it happens
// after mount, and a store that refuses to answer leaves the defaults standing.
function readHidden(resource: string): string[] | null {
  try {
    const stored = window.localStorage.getItem(storageKey(resource))
    const parsed: unknown = stored === null ? null : JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : null
  } catch {
    return null
  }
}

function writeHidden(resource: string, hidden: readonly string[]): void {
  try {
    window.localStorage.setItem(storageKey(resource), JSON.stringify(hidden))
  } catch {
    // a storage the browser refuses is a lost preference, never a broken register
  }
}

export function IndexTable({
  declaration,
  rows,
}: {
  declaration: TableDeclaration
  rows: readonly TableRow[]
}) {
  const [state, setState] = useState<TableState>(() => initialState(declaration))
  const [selected, setSelected] = useState<readonly number[]>([])

  useEffect(() => {
    const stored = readHidden(declaration.resource)
    if (stored) setState((current) => ({ ...current, hidden: stored }))
  }, [declaration.resource])

  useEffect(() => {
    writeHidden(declaration.resource, state.hidden)
  }, [declaration.resource, state.hidden])

  const view = tableView(rows, declaration, state)

  // any narrowing resets to the first page, or a reader filters a register down to four
  // rows and is left staring at page six of nothing
  const narrow = (change: Partial<TableState>) =>
    setState((current) => ({ ...current, ...change, page: 1 }))

  const toggleSort = (key: string) =>
    setState((current) => ({
      ...current,
      sortKey: key,
      sortDirection: current.sortKey === key && current.sortDirection === 'asc' ? 'desc' : 'asc',
    }))

  const toggleColumn = (key: string) =>
    narrow({
      hidden: state.hidden.includes(key)
        ? state.hidden.filter((hidden) => hidden !== key)
        : [...state.hidden, key],
    })

  const pageColumns =
    view.columns.length + (declaration.bulkActionKey ? 1 : 0) + (declaration.editPath ? 1 : 0)

  return (
    <div>
      <label htmlFor={`${declaration.resource}-search`}>{t('table.search')}</label>
      <input
        id={`${declaration.resource}-search`}
        type="search"
        value={state.search}
        onChange={(event) => narrow({ search: event.target.value })}
      />

      <details>
        <summary>{t('table.columns')}</summary>
        {declaration.columns.map((column) => (
          <label key={column.key}>
            <input
              type="checkbox"
              checked={!state.hidden.includes(column.key)}
              onChange={() => toggleColumn(column.key)}
            />
            {t(column.labelKey)}
          </label>
        ))}
      </details>

      {declaration.filters && declaration.filters.length > 0 && (
        <details>
          <summary>{t('table.filters')}</summary>
          {declaration.filters.map((filter) => (
            <label key={filter.key}>
              {t(filter.labelKey)}
              <select
                value={state.filters[filter.key] ?? ''}
                onChange={(event) =>
                  narrow({ filters: { ...state.filters, [filter.key]: event.target.value } })
                }
              >
                <option value="">{t('table.filters.any')}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="button" onClick={() => narrow({ filters: {} })}>
            {t('table.filters.reset')}
          </button>
        </details>
      )}

      <label htmlFor={`${declaration.resource}-page-size`}>{t('table.pageSize')}</label>
      <select
        id={`${declaration.resource}-page-size`}
        value={String(state.pageSize)}
        onChange={(event) =>
          narrow({
            pageSize: (event.target.value === 'all'
              ? 'all'
              : Number(event.target.value)) as PageSize,
          })
        }
      >
        {pageSizes.map((size) => (
          <option key={size} value={String(size)}>
            {size === 'all' ? t('table.pageSize.all') : size}
          </option>
        ))}
      </select>

      <table>
        <thead>
          <tr>
            {declaration.bulkActionKey && (
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label={t('table.selectAll')}
                  checked={selected.length > 0 && selected.length === view.rows.length}
                  onChange={(event) =>
                    setSelected(event.target.checked ? view.rows.map((row) => row.id) : [])
                  }
                />
              </th>
            )}
            {view.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  state.sortKey === column.key
                    ? state.sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {column.sortable ? (
                  <button type="button" onClick={() => toggleSort(column.key)}>
                    {t(column.labelKey)}
                  </button>
                ) : (
                  t(column.labelKey)
                )}
              </th>
            ))}
            {declaration.editPath && <th scope="col">{t('table.actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {view.rows.length === 0 ? (
            <tr>
              <td colSpan={pageColumns}>{t(declaration.emptyKey)}</td>
            </tr>
          ) : (
            view.rows.map((row) => (
              <tr key={row.id}>
                {declaration.bulkActionKey && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t('table.selectRow')}
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, row.id]
                            : selected.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                )}
                {view.columns.map((column) => (
                  <td key={column.key}>{formatCell(row[column.key] ?? null) ?? t('table.blank')}</td>
                ))}
                {declaration.editPath && (
                  <td>
                    <a href={rowPath(declaration.editPath, row.id)}>{t('table.action.edit')}</a>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* the bulk action is declared but unwired: the capture was GET-only, so nothing
          is known about the delete and no write path exists yet in the rebuild -
          docs/rebuild/00-operating-model.md §5 "Route contract" */}
      {declaration.bulkActionKey && (
        <button type="button" disabled={selected.length === 0}>
          {t(declaration.bulkActionKey)}
        </button>
      )}

      <p>{t('table.range', { from: view.from, to: view.to, total: view.matched })}</p>
      <button
        type="button"
        disabled={view.page <= 1}
        onClick={() => setState((current) => ({ ...current, page: view.page - 1 }))}
      >
        {t('table.previous')}
      </button>
      <button
        type="button"
        disabled={view.page >= view.pageCount}
        onClick={() => setState((current) => ({ ...current, page: view.page + 1 }))}
      >
        {t('table.next')}
      </button>
    </div>
  )
}
