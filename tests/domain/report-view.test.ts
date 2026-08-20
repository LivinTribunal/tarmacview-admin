import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import type { DeviceReportRow } from '@/lib/report/device-row'
import {
  airframeReportTable,
  airframeReportTableRow,
  pilotReportTable,
  pilotReportTableRow,
} from '@/lib/report/fields'
import { resolveSelection, type ReportPayload } from '@/lib/report/payload'
import type { PilotReportRow } from '@/lib/report/pilot-row'
import {
  activeTab,
  detailRow,
  expiryWarnings,
  periodOptions,
  pilotFilterValue,
  reportTiles,
  selectedPeriod,
  tabHref,
  unknownPilot,
} from '@/lib/report/view'
import { formatCell } from '@/lib/table/view'

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

// the same shape one table over: an airframe carrying the states this file is not asking
// about. configured and not due is the silent case, so every departure below is deliberate.
const airframe = (id: number, over: Partial<DeviceReportRow> = {}): DeviceReportRow => ({
  id,
  name: null,
  serial_number: `SN-PLACEHOLDER-${id}`,
  model: 'Placeholder Model',
  manufacturer: null,
  notes: null,
  type: 'Placeholder Quadcopter',
  status: t('device.status.active'),
  max_vlos_meters: '500',
  maintenance_instructions: null,
  maintenance_logs: [],
  last_flight_date: null,
  lifetime_flights_count: 0,
  total_flights: 0,
  total_flight_hours: 0,
  service_is_configured: true,
  service_due: false,
  service_due_reasons: [],
  service_interval_cycles: 50,
  service_lifetime_cycles: 0,
  service_baseline_cycles: 0,
  next_service_at_cycles: 50,
  service_remaining_cycles: 50,
  service_overdue_cycles: 0,
  service_interval_months: 12,
  service_calendar_baseline_date: null,
  next_service_date: null,
  service_remaining_days: null,
  service_overdue_days: null,
  service_warning: null,
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

describe('the pilot filter opens on what the query string asked for', () => {
  const roster = [pilot(1, 'Placeholder First Pilot'), pilot(2, 'Placeholder Second Pilot')]

  it('reads an absent filter and an empty one alike, which is all pilots', () => {
    // the wire shape doc 06 records - the report submits `pilot_id=` with nothing in it - and
    // what `resolveSelection` already parses, so the control and the parser agree on it
    expect(pilotFilterValue(null, roster)).toBe('')
    expect(pilotFilterValue('', roster)).toBe('')
  })

  it('opens on the pilot the reader picked, or a resubmit would silently widen the table', () => {
    expect(pilotFilterValue('2', roster)).toBe('2')
  })

  it('selects the placeholder for an id that names nobody on the roster', () => {
    // another operator's pilot id is the case that matters: the payload narrows to nothing and
    // the control must not read *all pilots* over an empty table. an unparseable id lands the
    // same way, beside the query error `resolveSelection` answers it with.
    expect(pilotFilterValue('999999', roster)).toBe(unknownPilot)
    expect(pilotFilterValue('not-an-id', roster)).toBe(unknownPilot)

    // and the placeholder is not the all-pilots value, which is the whole point of it
    expect(unknownPilot).not.toBe('')
  })
})

describe('the pilots table reports the payload own figures', () => {
  it('takes the flight count off the key and never off the rows beside it', () => {
    // the defect this slice most has to avoid. the payload says seven flights and one and a
    // half hours and carries no rows, which is a state a real payload never produces - so a
    // cell that sums `filtered_flights[]` answers 0 here and goes red.
    const row = pilotReportTableRow(
      pilot(1, 'Placeholder Flown Pilot', {
        flights_count: 7,
        total_hours: 1.5,
        filtered_flights: [],
      }),
    )

    expect(row.flights_count).toBe(7)

    // and the decimal comma, from the one formatter the chrome already applies to a cell
    expect(formatCell(row.total_hours ?? null)).toBe('1,5')
  })

  it('keeps a gap, a stated no-expiry and a valid certificate three different cells', () => {
    // three answers and not two. the pilot who holds nothing renders the gap alone, because
    // `formatDate` answers null for a null expiry and an absent part is dropped rather than
    // printed - and one label over the gap and the pass is what this rules out.
    const cells = [
      pilot(1, 'Placeholder Uncertificated Pilot', {
        licence_status: t('report.pilot.certificateStatus.none'),
      }),
      pilot(2, 'Placeholder Never Expires Pilot', {
        licence_status: t('report.pilot.certificateStatus.noExpiry'),
        licence_types: [t('person.certificateType.A1_A3')],
      }),
      pilot(3, 'Placeholder Certificated Pilot', {
        licence_status: t('report.pilot.certificateStatus.valid'),
        licence_date: '2027-06-30',
        licence_types: [t('person.certificateType.A1_A3')],
      }),
    ].map((row) => pilotReportTableRow(row).certificate)

    expect(cells[0]).toBe(t('report.pilot.certificateStatus.none'))
    expect(new Set(cells).size).toBe(3)

    // the expiry renders in the one format this application prints, and only where one was
    // stated
    expect(cells[2]).toContain('30.06.2027')
    expect(cells[1]).not.toContain('.')
  })

  it('opens a detail on the period the reader is already looking at', () => {
    const [column] = pilotReportTable(new URLSearchParams('period=last_month')).columns

    expect(column?.linkPath).toContain('detail={id}')
    expect(column?.linkPath).toContain('period=last_month')
  })
})

describe('the UAS table tells the gap from the pass', () => {
  it('reads an airframe with no device type as not configured and one inside its interval as nothing', () => {
    // both carry `service_due: false` and only one of them is an all-clear. an airframe with
    // no device type has no VLOS limit and no service interval, so it can never register a
    // service warning - a cell keyed off the boolean prints the same nothing for both and
    // goes red here.
    const gap = airframeReportTableRow(
      airframe(1, {
        service_is_configured: false,
        service_interval_cycles: null,
        service_interval_months: null,
        next_service_at_cycles: null,
        service_remaining_cycles: null,
        service_overdue_cycles: null,
        service_warning: t('device.warning.noDeviceType'),
      }),
    )
    const withinInterval = airframeReportTableRow(airframe(2))

    expect(gap.service).toBe(t('device.warning.noDeviceType'))
    expect(withinInterval.service).toBeNull()
  })

  it('names a due service, so the blank cell above is the not-due state and not a third gap', () => {
    const due = airframeReportTableRow(
      airframe(3, {
        service_due: true,
        service_due_reasons: [t('device.serviceLimit.cycles')],
        service_warning: t('device.warning.serviceDue'),
      }),
    )

    expect(due.service).toBe(t('device.warning.serviceDue'))
  })

  it('carries the period into its row link as the pilots table does', () => {
    const [column] = airframeReportTable(new URLSearchParams('period=last_month')).columns

    expect(column?.linkPath).toContain('tab=uas')
    expect(column?.linkPath).toContain('period=last_month')
  })
})

describe('the two tabs and the detail each row opens are addressed on the query string', () => {
  it('opens on the pilots tab where no tab was asked for', () => {
    expect(activeTab(null)).toBe('pilots')
  })

  it('answers nothing for a tab this application does not name, which the page reads as absent', () => {
    // deliberately not the period's treatment. a period is a filter over content and renders
    // its error beside the selector; a tab is the address of a section, and a link to one
    // nobody built is a broken link.
    expect(activeTab('flights')).toBeNull()
  })

  it('carries the reader window across a tab link and drops the open detail', () => {
    const href = tabHref(new URLSearchParams('period=custom&date_from=2026-07-01&detail=4'), 'uas')

    expect(href).toContain('period=custom')
    expect(href).toContain('date_from=2026-07-01')
    expect(href).toContain('tab=uas')

    // a row id from one register names no row in the other, so it does not ride along
    expect(href).not.toContain('detail')
  })

  it('finds the detail row in the rows already in hand, and none for an id they do not carry', () => {
    const rows = [pilot(1, 'Placeholder First Pilot'), pilot(2, 'Placeholder Second Pilot')]

    expect(detailRow(rows, '2')?.name).toBe('Placeholder Second Pilot')

    // the cross-tenant id and the junk one answer the same nothing: an id naming no row in
    // the payload the page holds opens no detail
    expect(detailRow(rows, '999999')).toBeNull()
    expect(detailRow(rows, 'not-an-id')).toBeNull()
    expect(detailRow(rows, null)).toBeNull()
  })
})
