import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import type { DeviceReportRow } from '@/lib/report/device-row'
import { flightReportTable, flightReportTableRow, vlosAnswer } from '@/lib/report/fields'
import type { FlightReportRow } from '@/lib/report/flight-row'
import { formatCell } from '@/lib/table/view'

// *Lety za vybrané obdobie* - docs/specs/06-org-report.md §Layout item 6 and §Tables. four
// domain rules land in this one table: a failed parse keeps its row, an unassigned flight
// keeps its row, an airframe with no VLOS limit must never read as a pass, and no figure is
// recomputed from anything but the key the payload carries.

// a flight carrying the states this file is not asking about: parsed, assigned, judged and
// inside its limit. every departure below is deliberate.
const flight = (id: number, over: Partial<FlightReportRow> = {}): FlightReportRow => ({
  id,
  pilot_id: 10,
  pilot_name: 'Placeholder Pilot',
  device_id: 20,
  device_serial_number: 'SN-PLACEHOLDER-0001',
  device_model: 'Placeholder Model',
  flight_hours: 1.5,
  max_altitude: 95.5,
  max_distance: 420.25,
  flight_date: '2026-07-14',
  flight_date_display: '14.07.2026',
  flight_date_sort: Date.UTC(2026, 6, 14),
  parsing_status: t('flight.parsingStatus.processed'),
  parsing_errors: '',
  has_vlos_violation: false,
  ...over,
})

// only the two keys the `STAV` cell reads off an airframe. the row it comes from is
// data.devices[]'s, which the page already holds.
const airframe = (id: number, maxVlos: string | null): DeviceReportRow =>
  ({ id, max_vlos_meters: maxVlos }) as DeviceReportRow

const fleet = [airframe(20, '500'), airframe(21, null)]

describe('the seven columns doc 06 §Tables names, in its order', () => {
  it('declares them all and declares no row action', () => {
    expect(flightReportTable.columns.map((column) => column.key)).toEqual([
      'status',
      'date',
      'pilot',
      'uas',
      'flight_time',
      'max_altitude',
      'distance',
    ])

    // `Priradiť` is §Tables' inline fallback and its write is not served yet. a button that
    // does nothing tells a reader an action exists, so no row action is declared at all -
    // and no column claims a sort the capture never showed.
    expect(flightReportTable.editPath).toBeUndefined()
    expect(flightReportTable.bulkActionKey).toBeUndefined()
    expect(flightReportTable.columns.every((column) => !column.linkPath)).toBe(true)
    expect(flightReportTable.columns.every((column) => !column.sortable)).toBe(true)
  })
})

describe('every cell is a key the payload already carries', () => {
  it('renders the payload own date and never re-derives it from `flight_date`', () => {
    // the two disagree on purpose here, which a real payload never does: `flight_date_display`
    // is the rendering and a cell formatting `flight_date` itself answers the other one.
    const row = flightReportTableRow(
      flight(1, { flight_date: '2026-07-14', flight_date_display: '01.01.2001' }),
      fleet,
    )

    expect(row.date).toBe('01.01.2001')
  })

  it('leaves the three measurements as numbers, so the decimal comma comes off the chrome', () => {
    const row = flightReportTableRow(flight(1), fleet)

    expect([row.flight_time, row.max_altitude, row.distance]).toEqual([1.5, 95.5, 420.25])
    expect(formatCell(row.distance ?? null)).toBe('420,25')
  })
})

describe('a failed parse is still a record', () => {
  it('renders a row carrying its status and its error', () => {
    // dropping it loses the evidence that a flight happened, and the error beside the status
    // is what says why there is nothing else on the row
    const row = flightReportTableRow(
      flight(1, {
        parsing_status: t('flight.parsingStatus.failed'),
        parsing_errors: 'Placeholder parse failure.',
        flight_hours: 0,
        max_altitude: 0,
        max_distance: 0,
      }),
      fleet,
    )

    expect(row.status).toContain(t('flight.parsingStatus.failed'))
    expect(row.status).toContain('Placeholder parse failure.')
  })

  it('drops the empty string a null `parsing_errors` serialises as', () => {
    // the one blank the payload keeps honest: no error recorded is exactly what an empty
    // message means, and printing a separator after it would read as a truncated one
    const row = flightReportTableRow(flight(1), fleet)

    expect(row.status).toBe(t('flight.parsingStatus.processed'))
  })

  it('keeps the parsing half and the VLOS half two axes of one cell', () => {
    // §Tables gives `STAV` one column and the two answers are independent: a parsed flight can
    // breach the limit and a failed one can be unjudgeable. folding them into a single state
    // loses one of the two.
    const row = flightReportTableRow(
      flight(1, { has_vlos_violation: true, parsing_errors: 'Placeholder parse note.' }),
      fleet,
    )

    expect(row.status).toBe(
      `${t('flight.parsingStatus.processed')}, Placeholder parse note., ${t('report.flight.vlos.violation')}`,
    )
  })
})

describe('an unassigned flight is still a flight', () => {
  it('renders the payload named absences and no `Priradiť` action', () => {
    // `pilot_id` and `device_id` are null while the two labels still carry text - the
    // unassigned shape doc 06 describes, already resolved in flight-row.ts. the row lists
    // rather than being filtered out, and it renders the label rather than an action whose
    // write is not served.
    const row = flightReportTableRow(
      flight(1, {
        pilot_id: null,
        pilot_name: t('report.flight.pilot.unassigned'),
        device_id: null,
        device_serial_number: t('report.flight.device.unassigned'),
        device_model: t('report.flight.device.unassigned'),
      }),
      fleet,
    )

    expect(row.pilot).toBe(t('report.flight.pilot.unassigned'))
    expect(row.uas).toBe(t('report.flight.device.unassigned'))
    expect(JSON.stringify(row)).not.toContain('Priradiť')
  })
})

describe('`has_vlos_violation: false` renders as more than one answer', () => {
  it('names the violation', () => {
    expect(vlosAnswer(flight(1, { has_vlos_violation: true }), fleet)).toBe(
      t('report.flight.vlos.violation'),
    )
  })

  it('says nothing about a flight that was judged and stayed inside the limit', () => {
    // affirmative-only: the pass is the silent state and the chrome renders the blank marker
    // over it, the same treatment `service_warning` gets one table over
    expect(vlosAnswer(flight(1), fleet)).toBeNull()
  })

  it('names the gap where there is no limit to judge against', () => {
    // an airframe with no device type, and a flight with no airframe at all. neither could
    // ever register a violation, so a cell keyed off the boolean prints the same nothing for
    // these as for the pass above.
    expect(vlosAnswer(flight(1, { device_id: 21 }), fleet)).toBe(t('report.flight.vlos.notJudged'))
    expect(vlosAnswer(flight(2, { device_id: null }), fleet)).toBe(
      t('report.flight.vlos.notJudged'),
    )
  })

  it('names the gap where no distance was recorded to judge', () => {
    // `max_distance` serialises a null as `0` to hold parity, so a recorded zero and no
    // reading at all are one figure. the ceiling is deliberate and doc 06 records it: a
    // genuine zero names a gap it does not have, and the reverse would be a gap reading as a
    // pass.
    expect(vlosAnswer(flight(1, { max_distance: 0 }), fleet)).toBe(
      t('report.flight.vlos.notJudged'),
    )
  })

  it('keeps the gap and the pass distinguishable, which is the whole point', () => {
    // the assertion that goes red the moment the two collapse into one cell
    const judged = flightReportTableRow(flight(1), fleet).status
    const unjudgeable = flightReportTableRow(flight(2, { device_id: 21 }), fleet).status

    expect(judged).not.toBe(unjudgeable)
  })

  it('resolves the airframe against the rows in hand and never by a second read', () => {
    // an airframe the payload does not carry is another operator's, so it is a gap here
    // rather than a limit - which is what makes the scoping structural
    expect(vlosAnswer(flight(1, { device_id: 999_999 }), fleet)).toBe(
      t('report.flight.vlos.notJudged'),
    )
  })
})
