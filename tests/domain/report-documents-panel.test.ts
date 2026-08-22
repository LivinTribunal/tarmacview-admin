import { describe, expect, it } from 'vitest'
import type { MessageKey } from '@/lib/i18n'
import { documentGroups, type DocumentGroup } from '@/lib/report/view'
import type { DocumentEntry } from '@/lib/tenant/scoped-documents'
import type { IncidentEntry } from '@/lib/tenant/scoped-incidents'

// the documents panel's pure half - docs/specs/06-org-report.md §"The documents panel in the
// rebuild". four counted groups over rows the page has already read, so what the builder
// decides is the group set, the counts and where each entry links - all assertable without
// a dom.
//
// what it deliberately does not decide is which rows are readable. that is
// `document_tenant_isolation` and `incident_tenant_isolation`, asserted over a real database
// in tests/tenancy/report-page.test.ts and tests/tenancy/report-document-download.test.ts.

// only the columns the panel reads are stated; the rest are the row shape's and say nothing
// about what is being asserted
const doc = (id: number, name: string): DocumentEntry =>
  ({ id, name, filePath: `permits/placeholder-${id}.pdf` }) as DocumentEntry

const report = (id: number, title: string, filePath: string | null): IncidentEntry =>
  ({ id, title, filePath }) as IncidentEntry

const empty = { organizationId: 7, operations: [], forms: [], permits: [], incidents: [] }

// a group by its label rather than by its position, so an assertion about one bucket does
// not quietly become an assertion about the order. a missing group answers `-1`, which no
// count below expects - an empty stand-in would read as the bucket being empty.
const groupOf = (groups: readonly DocumentGroup[], labelKey: MessageKey): DocumentGroup =>
  groups.find((group) => group.labelKey === labelKey) ?? { labelKey, count: -1, entries: [] }

describe('the four groups, which are four whatever the buckets hold', () => {
  it('renders in doc 06 order, each carrying its own row count', () => {
    const groups = documentGroups({
      organizationId: 7,
      operations: [doc(1, 'Placeholder Operations Manual')],
      forms: [doc(2, 'Placeholder Form'), doc(3, 'Placeholder Second Form')],
      permits: [doc(4, 'placeholder-permit.pdf')],
      incidents: [report(5, 'Placeholder Occurrence', null), report(6, 'Placeholder Second', null)],
    })

    expect(groups.map((group) => group.labelKey)).toEqual([
      'report.documents.documents',
      'report.documents.forms',
      'report.documents.permits',
      'report.documents.incidents',
    ])
    expect(groups.map((group) => group.count)).toEqual([1, 2, 1, 2])
  })

  it('keeps a bucket with no rows, counted zero rather than dropped', () => {
    // a count is a figure over a bucket that was actually read, so `(0)` is a statement and
    // not the affirmative-only rule's silence. an operator looking for a permit needs to see
    // the bucket empty rather than the group missing.
    const groups = documentGroups({ ...empty, forms: [doc(1, 'Placeholder Form')] })

    expect(groups).toHaveLength(4)
    expect(groups.map((group) => group.count)).toEqual([0, 1, 0, 0])
  })

  it('renders four groups for an organisation holding nothing at all', () => {
    const groups = documentGroups(empty)

    expect(groups).toHaveLength(4)
    expect(groups.every((group) => group.count === 0 && group.entries.length === 0)).toBe(true)
  })
})

describe('where an entry links, which is a row id and never a stored path', () => {
  const groups = documentGroups({
    organizationId: 7,
    operations: [doc(11, 'Placeholder Operations Manual')],
    forms: [doc(12, 'Placeholder Form')],
    permits: [doc(13, 'placeholder-permit.pdf')],
    incidents: [report(14, 'Placeholder Occurrence', 'incidents/placeholder.pdf')],
  })

  const hrefs = (labelKey: MessageKey) =>
    groupOf(groups, labelKey).entries.map((entry) => entry.href)

  it('sends the three document buckets to their own oracle download path', () => {
    expect(hrefs('report.documents.documents')).toEqual([
      '/organization-reports/7/documents/11/download',
    ])
    expect(hrefs('report.documents.forms')).toEqual(['/organization-reports/7/forms/12/download'])
    expect(hrefs('report.documents.permits')).toEqual([
      '/organization-reports/7/permits/13/download',
    ])
  })

  it('sends an occurrence report to the route that already serves its file', () => {
    // `contracts/routes.json` carries no report path for incidents and the occurrence
    // register reaches its file here already, so no fourth path is minted
    expect(hrefs('report.documents.incidents')).toEqual(['/api/incidents/14/file'])
  })

  it('carries no stored path on any entry, in the href or in what the reader sees', () => {
    const rendered = JSON.stringify(groups)

    expect(rendered).not.toContain('permits/placeholder-13.pdf')
    expect(rendered).not.toContain('incidents/placeholder.pdf')
  })
})

describe('an occurrence report that names no file', () => {
  it('keeps its entry with no link, because the record is the evidence and the file is not', () => {
    const incidents = groupOf(
      documentGroups({
        ...empty,
        incidents: [
          report(21, 'Placeholder Occurrence With File', 'incidents/placeholder.pdf'),
          report(22, 'Placeholder Occurrence Without File', null),
        ],
      }),
      'report.documents.incidents',
    )

    expect(incidents.count).toBe(2)
    expect(incidents.entries).toEqual([
      { id: 21, name: 'Placeholder Occurrence With File', href: '/api/incidents/21/file' },
      { id: 22, name: 'Placeholder Occurrence Without File', href: null },
    ])
  })
})
