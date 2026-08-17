import { t, type MessageKey } from '@/lib/i18n'
import type { ReportPayload } from '@/lib/report/payload'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import { formatCell } from '@/lib/table/view'

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
// opens in before one is ever picked; an unrecognised one selects nothing, because the error
// rendered beside it is the answer rather than a period.
export function selectedPeriod(raw: string | null): PeriodValue | null {
  if (raw === null) return 'this_month'
  return periodOptions.find((option) => option === raw) ?? null
}
