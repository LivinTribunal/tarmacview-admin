import { t, type MessageKey } from '@/lib/i18n'
import type { ReportPayload } from '@/lib/report/payload'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import { identifier } from '@/lib/routes/identifier'
import { formatCell, type CellValue } from '@/lib/table/view'
import type { DocumentEntry } from '@/lib/tenant/scoped-documents'
import type { IncidentEntry } from '@/lib/tenant/scoped-incidents'

// the operator report page's pure half - the split src/lib/table/view.ts and
// src/lib/organizations/workspace.ts already set. no react and no drizzle here, so the one
// claim this page exists to hold - that **no figure on the screen is recomputed** - is
// assertable without a dom and without a container.
//
// the three registers' declarations and row mappers are in src/lib/report/fields.ts, where
// every other resource files them. what stays here is the tiles, the warnings and the
// resolvers that read the query string.
//
// everything below reads the payload R1 to R3 built and nothing else. a second derivation
// of a number the payload already carries would drift from it, and the payload's is the one
// with tests.

type ReportData = ReportPayload['data']

// the three tiles docs/specs/06-org-report.md §Layout item 4 names, each a key read straight
// off the payload. `total_flight_minutes` is the same quantity as the hours under another
// name and is not a fourth tile, and `period_dates` renders beside the period selector
// rather than as one.
export type ReportTile = { labelKey: MessageKey; value: string }

// every figure on the screen, through the repo's one implementation of the decimal comma
// rather than a second copy of the replacement. an absent one is the blank marker the chrome
// already renders for a null cell: the tiles' three keys are not nullable, the detail views'
// service and per-device figures are.
//
// it takes a whole `CellValue` rather than a number, so the print view renders a row mapper's
// cells through this same one path - a table rendered without the chrome must not grow a
// second decimal comma beside the chrome's.
export const figure = (value: CellValue): string => formatCell(value) ?? t('table.blank')

export function reportTiles(data: ReportData): readonly ReportTile[] {
  return [
    { labelKey: 'report.tile.flightHours', value: figure(data.total_flight_hours) },
    { labelKey: 'report.tile.flights', value: figure(data.total_flights) },
    { labelKey: 'report.tile.activePilots', value: figure(data.active_pilots) },
  ]
}

// the states §Layout item 2's block lists. `valid` and `noExpiry` stay silent, which is the
// affirmative-only rule doc 05 owns; `none` lists beside the two lapses because a record
// nobody ever filed is a gap, and one label over the gap and the pass would let the gap read
// as the pass.
const listed = ['expiring', 'expired', 'none'] as const

// the payload carries both statuses as `t()`-resolved strings and the oracle gives this
// block no status-code key, so selection is a comparison against `t()` of the same key -
// what tests/tenancy/report-data-isolation.test.ts already does.
//
// each field is compared against **its own** key family. `report.pilot.trainingStatus.*` and
// `report.pilot.certificateStatus.*` render the same slovak for four of their five states
// today, so a crossed comparison would pass now and break the moment a translator separates
// them.
const warned = (status: string, family: 'trainingStatus' | 'certificateStatus'): boolean =>
  listed.some((state) => t(`report.pilot.${family}.${state}`) === status)

export type ExpiryWarning = {
  // which of the two lapsed, as its own label rather than as a status code the payload does
  // not carry
  labelKey: MessageKey
  // the status the payload already resolved, never one recomputed here
  status: string
  // the expiry it was resolved against, where one was stated. `none` carries no date,
  // because the gap is the absence of the record rather than of a field on it.
  validUntil: string | null
}

export type PilotExpiryWarnings = {
  id: number
  name: string
  // one entry per half that has something to surface, never empty: a pilot with nothing to
  // surface has no row at all, and where nobody has anything the block is absent
  warnings: readonly ExpiryWarning[]
}

export function expiryWarnings(
  pilots: readonly PilotReportRow[],
): readonly PilotExpiryWarnings[] {
  return pilots
    .map((pilot) => ({
      id: pilot.id,
      name: pilot.name,
      warnings: [
        warned(pilot.training_status, 'trainingStatus')
          ? {
              labelKey: 'report.warning.training' as const,
              status: pilot.training_status,
              validUntil: pilot.training_date,
            }
          : null,
        warned(pilot.licence_status, 'certificateStatus')
          ? {
              labelKey: 'report.warning.certificate' as const,
              status: pilot.licence_status,
              validUntil: pilot.licence_date,
            }
          : null,
      ].filter((warning) => warning !== null),
    }))
    .filter((pilot) => pilot.warnings.length > 0)
}

// doc 06 §"Documents panel" - the four counted groups of item 7, as data. a group is its
// label, its count and its entries, so the panel is assertable without a dom: what the page
// does with it is a heading and a list.
export type DocumentGroupEntry = {
  id: number
  // what the reader sees. the row's own name and never the path it is stored at - the rule
  // docs/specs/03-data-model.md §"Serving a stored file in the rebuild" owns, held here by
  // not reading `file_path` at all.
  name: string
  // null where the record names no file. only an occurrence report can be in that state -
  // `document.file_path` is not null - and it keeps its entry, because the row is the record
  // and the file is an attachment to it.
  href: string | null
}

export type DocumentGroup = {
  // one key per group, each carrying its own `{count}` placeholder: a label and its number
  // are one translatable string rather than fragments a component concatenates
  labelKey: MessageKey
  count: number
  entries: readonly DocumentGroupEntry[]
}

// the report's own download path, one per bucket the oracle names. it takes a row id and
// nothing else that the handler reads: the bucket segment is the address the oracle spells
// and the boundary is `document_tenant_isolation`, which doc 06 §"Documents panel" records
// as a stated cost rather than a filter.
const downloadPath = (organizationId: number, bucket: string, id: number): string =>
  `/organization-reports/${organizationId}/${bucket}/${id}/download`

// what the four groups read. three document buckets and the occurrence register, each
// already scoped by the reads the page makes - nothing here filters, so an entry the caller
// could not read was never in the list.
export type DocumentPanelInput = {
  organizationId: number
  operations: readonly DocumentEntry[]
  forms: readonly DocumentEntry[]
  permits: readonly DocumentEntry[]
  incidents: readonly IncidentEntry[]
}

const documentEntries = (
  organizationId: number,
  bucket: string,
  rows: readonly DocumentEntry[],
): readonly DocumentGroupEntry[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    href: downloadPath(organizationId, bucket, row.id),
  }))

// four groups, always, in doc 06 §"Documents panel"'s order. an empty bucket keeps its group
// and states `(0)`: a count is a figure over a bucket that was actually read, so it is not
// the affirmative-only rule's territory - an operator looking for a permit needs to see the
// bucket empty rather than the group missing.
//
// the occurrence register is the odd one and reaches its file through the route that already
// serves it, `/api/incidents/{id}/file`. `contracts/routes.json` carries no report path for
// incidents, and a fourth one minted to make the panel symmetrical would be a path the
// capture does not have.
export function documentGroups(input: DocumentPanelInput): readonly DocumentGroup[] {
  return [
    {
      labelKey: 'report.documents.documents',
      count: input.operations.length,
      entries: documentEntries(input.organizationId, 'documents', input.operations),
    },
    {
      labelKey: 'report.documents.forms',
      count: input.forms.length,
      entries: documentEntries(input.organizationId, 'forms', input.forms),
    },
    {
      labelKey: 'report.documents.permits',
      count: input.permits.length,
      entries: documentEntries(input.organizationId, 'permits', input.permits),
    },
    {
      labelKey: 'report.documents.incidents',
      count: input.incidents.length,
      entries: input.incidents.map((row) => ({
        id: row.id,
        name: row.title,
        href: row.filePath === null ? null : `/api/incidents/${row.id}/file`,
      })),
    },
  ]
}

// the three §Layout item 3 names, in its order. these are the **wire** values
// `resolveSelection` parses and each label is keyed off the same spelling, so the selector
// and the parser cannot come to name different periods - tests/domain/report-view.test.ts
// round-trips every one of them through it.
export const periodOptions = ['this_month', 'last_month', 'custom'] as const
export type PeriodValue = (typeof periodOptions)[number]

// which option the selector opens on. an absent period is `this_month`, the state the screen
// opens in before one is ever picked; an unrecognised one selects none of the three, because
// the error rendered beside it is the answer rather than a period - the page's placeholder
// option is what that state shows.
export function selectedPeriod(raw: string | null): PeriodValue | null {
  if (raw === null) return 'this_month'
  return periodOptions.find((option) => option === raw) ?? null
}

// the two tabs doc 06 §Layout item 5 names, `?tab=pilots|uas`. the workspace's
// `?activeRelationManager={n}` is indexed because the oracle spelled it that way;
// contracts/routes.json carries only the path for this screen, so the name is the rebuild's
// and a named value is the legible one.
export const reportTabs = ['pilots', 'uas'] as const
export type ReportTab = (typeof reportTabs)[number]

// `Štatistiky pilotov` is Observed. the UAS tab's own slovak label was never captured - doc
// 06 records it as "UAS tab" and nothing more - so this one is the rebuild's naming and doc
// 06 says so rather than letting it read as an observation.
export const tabLabels: Record<ReportTab, MessageKey> = {
  pilots: 'report.tab.pilots',
  uas: 'report.tab.uas',
}

// absent is the first tab, the way an absent period is `this_month`. unrecognised is null and
// the page turns that into not-found rather than falling back, for the reason `activeTabIndex`
// records: a link to a tab nobody built answering 200 is the reading that survives longest
// before anyone notices. this one is the stricter of the two - `activeTabIndex` answers the
// first tab for an unparseable value, while a tab here is named rather than indexed, so
// anything that is not one of the two names is a broken link.
//
// so null means something different here from what it means in `selectedPeriod` above, and
// deliberately: a period is a filter over content and its error renders beside the selector,
// while a tab is the address of a section.
export function activeTab(raw: string | null): ReportTab | null {
  if (raw === null) return 'pilots'
  return reportTabs.find((tab) => tab === raw) ?? null
}

// a tab link carries the reader's whole window forward and drops the open detail. without the
// first, switching tabs silently resets the period they typed; without the second, a row id
// from one register would ride into the other, where it names no row.
export function tabHref(submitted: URLSearchParams, tab: ReportTab): string {
  const carried = new URLSearchParams(submitted)
  carried.delete('detail')
  carried.set('tab', tab)
  return `?${carried}`
}

// the print link, beside `tabHref` and carrying the reader's whole window the same way - the
// document has to match the screen it was printed from, so the filter state travels in the
// link rather than the print view reverting to *this month*. the query string rides along
// verbatim, so a filter parameter a later slice adds carries without anyone remembering to
// add it here; `tab` and `detail` ride along unread, which doc 06 records.
export function printHref(organizationId: number, submitted: URLSearchParams): string {
  const carried = String(submitted)
  return `/organization-reports/${organizationId}/print${carried === '' ? '' : `?${carried}`}`
}

// what the printed pack was produced under. the screen states its narrowing in the controls
// the reader submitted it with and a document has none, so a pack filtered to one pilot with
// nothing saying so is a gap reading as a fact - the error class doc 06 rules out everywhere.
export type SelectionLine = { labelKey: MessageKey; value: string }

// the filter as a line, resolved **against the rows the payload already carries** - the
// `detailRow` reading, and structural for the same reason: another operator's id was never in
// the payload to be named. absent and empty alike are no line at all, which is the
// `pilot_id=` wire shape `resolveSelection` already reads as *no filter*.
function filterLine<Row extends { id: number }>(
  raw: string | null,
  rows: readonly Row[],
  name: (row: Row) => string,
  unknownKey: MessageKey,
): string | null {
  if (raw === null || raw === '') return null

  const id = identifier(raw)
  const row = id === null ? undefined : rows.find((candidate) => candidate.id === id)
  return row === undefined ? t(unknownKey) : name(row)
}

// the pilot line always renders, because *all pilots* is itself the statement a reader needs;
// the airframe line only where one was asked for, since no control sets `device_id` and a
// line saying nothing was filtered on a parameter nobody submits is noise.
export function selectionLines(
  submitted: URLSearchParams,
  data: ReportData,
): readonly SelectionLine[] {
  const pilot = filterLine(
    submitted.get('pilot_id'),
    data.pilots,
    (row) => row.name,
    'report.filter.pilot.unknown',
  )
  const device = filterLine(
    submitted.get('device_id'),
    data.devices,
    (row) => row.serial_number,
    'report.filter.device.unknown',
  )

  return [
    { labelKey: 'report.filter.pilot' as const, value: pilot ?? t('report.filter.pilot.all') },
    ...(device === null ? [] : [{ labelKey: 'report.filter.device' as const, value: device }]),
  ]
}

// which row a `?detail={id}` names, looked up **in the rows the page already holds**. an id
// naming none of them opens no detail, which is what makes the scoping structural rather than
// a discipline: another operator's id was never in the payload to be found.
export function detailRow<Row extends { id: number }>(
  rows: readonly Row[],
  raw: string | null,
): Row | null {
  const id = raw === null ? null : identifier(raw)
  if (id === null) return null
  return rows.find((row) => row.id === id) ?? null
}

// the option value the placeholder carries, for a `pilot_id` that names nobody on the roster.
// the empty value is *all pilots* here rather than the nothing-selected state `selectedPeriod`
// gives the period, so the two cannot share one - `resolveSelection` reads an absent filter and
// an empty one alike, which is doc 06's own `pilot_id=&device_id=` wire shape.
export const unknownPilot = 'unknown'

// which pilot the filter has selected, as the value the select opens on. an id that parses but
// names nobody in the roster selects the disabled placeholder rather than falling back: without
// it the control would read *all pilots* over a table the payload has narrowed to nothing.
//
// the roster is `data.pilots[]`, which is every pilot the organisation rosters whatever the
// filter says, so a reader can always widen back out.
export function pilotFilterValue(raw: string | null, pilots: readonly PilotReportRow[]): string {
  if (raw === null || raw === '') return ''

  const id = identifier(raw)
  return id !== null && pilots.some((pilot) => pilot.id === id) ? String(id) : unknownPilot
}
