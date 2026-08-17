import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { organizationIncidentTable, organizationIncidentTableRow } from '@/lib/incidents/fields'
import { formatCell } from '@/lib/table/view'
import type { IncidentEntry } from '@/lib/tenant/scoped-incidents'

// docs/specs/05-organization-workspace.md §6, asserted as a declaration - the footing
// airframe-columns.test.ts and the workspace half of document-columns.test.ts sit on, and
// deliberately not in tests/contracts/: `contracts/forms/` has no incident entry at all, so
// there is no oracle here, only doc 05's prose.
//
// this register's real subject is `Zranenia`, and it is the one cell in the rebuild that
// states three things. `injuries` is nullable where the three booleans this application
// renders as flags are `not null default false`, so a **no** here is an answer somebody gave
// and not the blank those three collapse a negative into - the exception doc 05 records beside
// its own affirmative-only rule.

const entry: IncidentEntry = {
  id: 31,
  organizationId: 4,
  title: 'Placeholder Occurrence With Injury',
  description: 'Placeholder occurrence description.',
  incidentDate: '2026-05-14',
  flightId: 12,
  injuries: true,
  notes: 'Placeholder occurrence note.',
  filePath: 'incidents/placeholder-alpha-incident.pdf',
  createdAt: new Date('2026-08-17T00:00:00Z'),
  flightFileName: 'placeholder-flight-0003.txt',
}

describe('the workspace occurrence tab declares doc 05 §6 columns, in order', () => {
  it('declares the four the doc names, which are *(inferred)* and not captured', () => {
    // doc 05 §6: *"Table columns not observed - the register was empty. Expect at least
    // `Názov` · `Dátum` · `Let` · `Zranenia`"*. four and no more: a fifth invented here would
    // be presented as captured by a register that has none.
    expect(organizationIncidentTable.columns.map((column) => column.key)).toEqual([
      'title',
      'incident_date',
      'flight',
      'injuries',
    ])
  })

  it('declares no sortable column, no filter, no bulk action and no row action', () => {
    // doc 05 §6 records a `Posledných 30 dní` filter and an `Odstrániť vybrané` bulk action,
    // both Observed from a GET-only capture. the filter is not even the `Verejné` shape that
    // FilterDef already has - a relative date window is not a static option list - and the
    // bulk removal is a write with no write path.
    expect(organizationIncidentTable.columns.some((column) => column.sortable)).toBe(false)
    expect(organizationIncidentTable.filters).toBeUndefined()
    expect(organizationIncidentTable.bulkActionKey).toBeUndefined()
    expect(organizationIncidentTable.editPath).toBeUndefined()
  })

  it('links no cell at the file route, because doc 05 §6 declares no file column', () => {
    // the three document tabs link their filename cell at `/api/documents/{id}/file`. this
    // one has no such column to link, and `incident.file_path` is nullable - so a link on
    // every row would point at a live 404 for every report carrying no file. the route is
    // reached by row id and asserted directly, in tests/domain/stored-file-route.test.ts.
    expect(organizationIncidentTable.columns.some((column) => column.linkPath)).toBe(false)
  })

  it('gives the tab its own empty wording rather than another register sentence', () => {
    expect(organizationIncidentTable.emptyKey).toBe('organization.workspace.incidents.empty')
    expect(t(organizationIncidentTable.emptyKey)).not.toBe(t('document.index.empty'))
  })
})

describe('the workspace occurrence tab rows', () => {
  it('carries a cell for every declared column', () => {
    const row = organizationIncidentTableRow(entry)
    for (const column of organizationIncidentTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('states `Zranenia` where somebody answered yes', () => {
    expect(organizationIncidentTableRow(entry).injuries).toBe(t('incident.injuries.yes'))
  })

  it('states an answered no as a word, and never as the blank an unanswered one gets', () => {
    // the whole of the exception. `Hlavná`, `Verejné` and `Tmavá mapa` render the affirmative
    // only, because a `not null default false` column cannot tell *not this* from *nobody set
    // one*. this column can, and on an occurrence report *"no, nobody was injured"* is the
    // recorded answer that matters most - blanking it would read as *nobody said*.
    const answered = organizationIncidentTableRow({ ...entry, injuries: false })

    expect(answered.injuries).toBe(t('incident.injuries.no'))
    expect(formatCell(answered.injuries ?? null)).not.toBeNull()
    expect(answered.injuries).not.toBe(organizationIncidentTableRow(entry).injuries)
  })

  it('leaves `Zranenia` blank where nobody answered at all, which is the third state', () => {
    // a null is a gap and never a pass - the same rule an airframe with no device type
    // states. rendering `Nie` here would report an all-clear nobody gave.
    const unanswered = organizationIncidentTableRow({ ...entry, injuries: null })

    expect(unanswered.injuries).toBeNull()
    expect(formatCell(unanswered.injuries ?? null)).toBeNull()
    // and the rest of the row still says which report it is
    expect(unanswered.title).toBe('Placeholder Occurrence With Injury')
  })

  it('names the linked flight by the name the flight register shows', () => {
    expect(organizationIncidentTableRow(entry).flight).toBe('placeholder-flight-0003.txt')
  })

  it('leaves `Let` blank where the report names no flight, which doc 05 §6 calls optional', () => {
    const unlinked = organizationIncidentTableRow({ ...entry, flightId: null, flightFileName: null })

    expect(unlinked.flight).toBeNull()
    expect(formatCell(unlinked.flight ?? null)).toBeNull()
    expect(unlinked.title).toBe('Placeholder Occurrence With Injury')
  })

  it('prints `Dátum` in the one format this application prints', () => {
    expect(organizationIncidentTableRow(entry).incident_date).toBe('14.05.2026')
  })

  it('puts neither the description, the notes nor the stored path in a cell', () => {
    // `incident_date` is required and the three below are not columns of this register at
    // all. the stored path in particular must never reach the browser - the row id is what
    // the file route is keyed on.
    const row = organizationIncidentTableRow(entry)
    expect(row).not.toHaveProperty('description')
    expect(row).not.toHaveProperty('notes')
    expect(Object.values(row)).not.toContain(entry.filePath)
  })
})
