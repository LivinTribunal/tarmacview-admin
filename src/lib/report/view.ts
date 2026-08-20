import { t, type MessageKey } from '@/lib/i18n'
import type { ReportPayload } from '@/lib/report/payload'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import { identifier } from '@/lib/routes/identifier'
import { formatCell } from '@/lib/table/view'

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
export const figure = (value: number | null): string => formatCell(value) ?? t('table.blank')

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
