import { formatDate, t, type MessageKey } from '@/lib/i18n'
import type { DeviceReportRow } from '@/lib/report/device-row'
import type { ReportPayload } from '@/lib/report/payload'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import { identifier } from '@/lib/routes/identifier'
import { formatCell, type TableDeclaration, type TableRow } from '@/lib/table/view'

// the operator report page's pure half - the split src/lib/table/view.ts and
// src/lib/organizations/workspace.ts already set. no react and no drizzle here, so the one
// claim this page exists to hold - that **no figure on the screen is recomputed** - is
// assertable without a dom and without a container.
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

// the decimal comma, from the repo's one implementation rather than a second copy of the
// replacement. `formatCell` answers null only for a null cell and none of these three keys
// is nullable, so the fallback is unreachable - it is here so nothing casts.
const figure = (value: number): string => formatCell(value) ?? String(value)

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
// the page turns that into not-found rather than falling back - `activeTabIndex`'s recorded
// reason holds here too: a link to a tab nobody built answering 200 is the reading that
// survives longest before anyone notices.
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

// the row link a table declares, as a path shape the chrome substitutes `{id}` into. built
// off `tabHref` so a detail opens on the period the reader is already looking at, and
// appended rather than set through `URLSearchParams`, which would percent-encode the braces.
const detailPath = (submitted: URLSearchParams, tab: ReportTab): string =>
  `${tabHref(submitted, tab)}&detail={id}`

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

// one cell out of the parts the payload already resolved, absences dropped rather than
// printed. `formatDate` answers null for a null date, so a pilot holding nothing renders the
// status alone - `Bez osvedčenia`, never `Bez osvedčenia` with a null beside it.
const composed = (...parts: readonly (string | null)[]): string =>
  parts.filter((part) => part !== null && part !== '').join(', ')

// *Štatistiky pilotov*, the five columns doc 06 §Tables names in its order. the headings are
// Observed slovak and are keyed here in sentence case: the capture's all-caps is appearance,
// and the clean-room line takes the wording and not the styling.
//
// the two keys read the same word as `report.warning.*` one block up and stay their own,
// which is the split `trainingStatus`/`certificateStatus` already records: a column heading
// and a lapse's label are two sentences that happen to coincide in slovak today, and sharing
// one would be right by accident.
//
// a declaration rather than a constant, because the row link has to carry the reader's
// period - `personTable(mayManage)` is the same shape for a different reason. no `editPath`
// and no `bulkActionKey`: `TableDeclaration`'s own comment says a resource whose row action
// has no served route declares none rather than linking at a live 404, and a detail is a
// disclosure rather than a route. no column declares `sortable` either - doc 06 captured no
// sort marker on this table, and inventing one is a behaviour nobody observed.
export function pilotReportTable(submitted: URLSearchParams): TableDeclaration {
  return {
    resource: 'report-pilots',
    emptyKey: 'organization.workspace.pilots.empty',
    columns: [
      { key: 'pilot', labelKey: 'report.column.pilot', linkPath: detailPath(submitted, 'pilots') },
      { key: 'flights_count', labelKey: 'report.column.flights' },
      { key: 'total_hours', labelKey: 'report.column.totalTime' },
      { key: 'training', labelKey: 'report.column.training' },
      { key: 'certificate', labelKey: 'report.column.certificate' },
    ],
  }
}

// flattens one payload row into the record the chrome renders. every figure is a key: the
// count is `flights_count` and never `filtered_flights.length`, which agrees with it on every
// real payload and is wrong for the reason this whole file exists.
//
// the two figures stay numbers rather than strings, so the decimal comma comes off
// `formatCell` in the one place the chrome already applies it.
export function pilotReportTableRow(pilot: PilotReportRow): TableRow {
  return {
    id: pilot.id,
    pilot: composed(pilot.name, pilot.email),
    flights_count: pilot.flights_count,
    total_hours: pilot.total_hours,

    // the payload's already-resolved status, never a second derivation of it, and the expiry
    // beside it only where one was stated. a pilot holding nothing renders `Bez školenia` /
    // `Bez osvedčenia` alone, which keeps the gap, the never-expires fact and the
    // valid-with-a-date three answers rather than two.
    training: composed(pilot.training_status, formatDate(pilot.training_date), pilot.training_name),
    certificate: composed(
      pilot.licence_status,
      formatDate(pilot.licence_date),
      pilot.licence_types.join(', '),
    ),
  }
}

// the UAS tab. doc 06 §Tables names its content - *per-airframe totals and service state* -
// and no column list was captured, so the five below are the rebuild's reading of that
// sentence: the airframe's identity, the period's two totals, and the one cell that answers
// the service question.
export function airframeReportTable(submitted: URLSearchParams): TableDeclaration {
  return {
    resource: 'report-uas',
    emptyKey: 'device.index.empty',
    columns: [
      {
        key: 'serial_number',
        labelKey: 'device.column.serial_number',
        linkPath: detailPath(submitted, 'uas'),
      },
      { key: 'model', labelKey: 'device.column.model' },
      { key: 'total_flights', labelKey: 'report.column.flights' },
      { key: 'total_flight_hours', labelKey: 'report.column.totalTime' },
      { key: 'service', labelKey: 'report.column.service' },
    ],
  }
}

// the service cell reads `service_warning` and never `service_due`. that one key already
// resolves three states where the boolean resolves two: the gap names itself, a due service
// names itself, and a service that is not due is null - which the chrome renders as the blank
// marker, per the affirmative-only rule, rather than as a tick.
//
// an airframe with no device type has no VLOS limit and no service interval, so it can never
// register a violation or a service warning. `service_due: false` beside it is *not knowable*
// and not an all-clear, and a cell keyed off the boolean would print the same nothing for
// both.
export function airframeReportTableRow(airframe: DeviceReportRow): TableRow {
  return {
    id: airframe.id,
    serial_number: airframe.serial_number,
    model: airframe.model,
    total_flights: airframe.total_flights,
    total_flight_hours: airframe.total_flight_hours,
    service: airframe.service_warning,
  }
}
