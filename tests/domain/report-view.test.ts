import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { resolveSelection, type ReportPayload } from '@/lib/report/payload'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import {
  expiryWarnings,
  periodOptions,
  reportTiles,
  selectedPeriod,
} from '@/lib/report/view'

// the report page's pure half - docs/specs/06-org-report.md §"The report page in the
// rebuild". the page reads the payload R1 to R3 built and derives nothing, and this is
// where that is a claim rather than a comment.

// a row carrying the states this file is not asking about, so each test states only what it
// is about. `valid` on both halves is the silent case, which makes every listed row below a
// deliberate departure from it.
const pilot = (id: number, name: string, over: Partial<PilotReportRow> = {}): PilotReportRow => ({
  id,
  name,
  email: t('report.pilot.email.none'),
  flights_count: 0,
  total_minutes: 0,
  total_hours: 0,
  avg_minutes: 0,
  avg_hours: 0,
  training_status: t('report.pilot.trainingStatus.valid'),
  training_date: null,
  training_name: null,
  licence_status: t('report.pilot.certificateStatus.valid'),
  licence_date: null,
  licence_types: [],
  licence_number: null,
  trainings: [],
  filtered_flights: [],
  flights_by_device: [],
  ...over,
})

describe('the tiles report the payload own totals', () => {
  it('reads the three figures off the payload when data.flights[] disagrees with them', () => {
    // the defect this whole split exists to make impossible. the payload says seven flights
    // and carries none, which is a state a real read never produces - so a tile computed
    // from `flights.length`, or from a reduce over the rows, answers 0 here and goes red.
    const data = {
      period_dates: { from: '01.08.2026', to: '31.08.2026' },
      total_flights: 7,
      total_flight_minutes: 90,
      total_flight_hours: 1.5,
      active_pilots: 2,
      pilots: [],
      devices: [],
      flights: [],
    } satisfies ReportPayload['data']

    // and the decimal comma on the one figure that has a fraction, from the repo's one
    // formatter rather than a second copy of the replacement
    expect(reportTiles(data).map((tile) => tile.value)).toEqual(['1,5', '7', '2'])
  })
})

describe('which pilots the expiry-warnings block lists', () => {
  it('lists one inside the window and omits one outside it', () => {
    const listed = expiryWarnings([
      pilot(1, 'Placeholder Expiring Pilot', {
        licence_status: t('report.pilot.certificateStatus.expiring'),
        licence_date: '2026-10-01',
      }),
      pilot(2, 'Placeholder Valid Pilot'),
    ])

    expect(listed.map((row) => row.name)).toEqual(['Placeholder Expiring Pilot'])
    expect(listed[0]?.warnings).toEqual([
      {
        labelKey: 'report.warning.certificate',
        status: t('report.pilot.certificateStatus.expiring'),
        validUntil: '2026-10-01',
      },
    ])
  })

  it('keeps a lapse, a gap and a stated no-expiry three different answers', () => {
    // the trap this block carries. `noExpiry` is a stated fact and stays silent; `none` is a
    // record nobody ever filed and lists under its own label. collapse the two and the gap
    // reads as the fact.
    const listed = expiryWarnings([
      pilot(1, 'Placeholder Expired Pilot', {
        licence_status: t('report.pilot.certificateStatus.expired'),
        licence_date: '2026-01-01',
      }),
      pilot(2, 'Placeholder Uncertificated Pilot', {
        licence_status: t('report.pilot.certificateStatus.none'),
      }),
      pilot(3, 'Placeholder Never Expires Pilot', {
        licence_status: t('report.pilot.certificateStatus.noExpiry'),
      }),
    ])

    expect(listed.map((row) => row.name)).toEqual([
      'Placeholder Expired Pilot',
      'Placeholder Uncertificated Pilot',
    ])
    expect(listed.map((row) => row.warnings[0]?.status)).toEqual([
      t('report.pilot.certificateStatus.expired'),
      t('report.pilot.certificateStatus.none'),
    ])

    // and the gap carries no date, because what is missing is the record rather than a
    // field on it
    expect(listed[1]?.warnings[0]?.validUntil).toBeNull()
  })

  it('matches each status against its own key family and never the other one', () => {
    // four of the five states render identical slovak under both families today, so a
    // crossed comparison would pass on any of them. `none` is the one pair that differs -
    // `Bez školenia` against `Bez osvedčenia` - and it is what makes this assertable at all.
    expect(t('report.pilot.trainingStatus.none')).not.toBe(
      t('report.pilot.certificateStatus.none'),
    )

    const [held] = expiryWarnings([
      pilot(1, 'Placeholder Untrained Pilot', {
        training_status: t('report.pilot.trainingStatus.none'),
      }),
    ])
    expect(held?.warnings.map((warning) => warning.labelKey)).toEqual(['report.warning.training'])

    const [missing] = expiryWarnings([
      pilot(2, 'Placeholder Uncertificated Pilot', {
        licence_status: t('report.pilot.certificateStatus.none'),
      }),
    ])
    expect(missing?.warnings.map((warning) => warning.labelKey)).toEqual([
      'report.warning.certificate',
    ])
  })

  it('lists both halves of one pilot when both have something to surface', () => {
    const [both] = expiryWarnings([
      pilot(1, 'Placeholder Lapsed Pilot', {
        training_status: t('report.pilot.trainingStatus.expired'),
        training_date: '2026-02-01',
        licence_status: t('report.pilot.certificateStatus.expiring'),
        licence_date: '2026-10-01',
      }),
    ])

    expect(both?.warnings.map((warning) => warning.labelKey)).toEqual([
      'report.warning.training',
      'report.warning.certificate',
    ])
  })

  it('yields nothing where nobody has anything to surface, so the block is absent', () => {
    // an empty list and not a row saying everything is fine: the page renders no block, and
    // an all-clear is exactly the reading a screen full of gaps must never produce
    expect(expiryWarnings([pilot(1, 'Placeholder Valid Pilot')])).toEqual([])
  })
})

describe('the period selector and the resolver name the same three periods', () => {
  const asOf = new Date('2026-08-15T12:00:00Z')

  it.each(periodOptions)('%s round-trips through resolveSelection', (option) => {
    // `custom` is the one that needs dates beside it; the other two carry the whole period
    // in the value. rename an option here without renaming the case there and this goes red.
    const dates = option === 'custom' ? '&date_from=2026-07-01&date_to=2026-07-14' : ''

    expect(resolveSelection(new URLSearchParams(`period=${option}${dates}`), asOf)).not.toBeNull()
    expect(selectedPeriod(option)).toBe(option)
  })

  it('opens on this month when no period was picked', () => {
    expect(selectedPeriod(null)).toBe('this_month')
  })

  it('selects nothing for a period the resolver refuses, so the error is the answer', () => {
    for (const raw of ['next_month', '']) {
      expect(selectedPeriod(raw), raw).toBeNull()
      expect(resolveSelection(new URLSearchParams(`period=${raw}`), asOf), raw).toBeNull()
    }
  })
})
