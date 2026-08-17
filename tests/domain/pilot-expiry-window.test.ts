import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { expiryWindow, pilotReportRow } from '@/lib/report/pilot-row'
import { pilotFlight, pilotTraining, testPerson, REPORT_DAY, testWindow } from '../support/pilots'

// the invariants the pilots block is most likely to get wrong, asserted over the serialiser
// rather than over a payload: every one of them is a judgement about one pilot's row.
//
// the expiry window is the organisation's own - `licence_expiry_warning_days`, not null
// default 40 - so every window below is stated and no assertion reads a constant. the two
// boundary tests are the mutation evidence this slice was asked for: each turns red for one
// flipped comparison and for nothing else.

const held = (validUntil: string | null) =>
  pilotReportRow({
    pilot: testPerson({ certificateNumber: 'CERT-PLACEHOLDER-0001', certificateValidUntil: validUntil }),
    trainings: [],
    flights: [],
    window: testWindow(),
  })

describe('the expiry window is read from the organisation and never from a constant', () => {
  // 26 days after the reporting day: inside a 40-day window, outside a 10-day one. a
  // serialiser that hardcoded the default would answer the same status for both.
  const expiry = '2026-09-10'

  const inside = (warningDays: number) =>
    pilotReportRow({
      pilot: testPerson({
        certificateNumber: 'CERT-PLACEHOLDER-0001',
        certificateValidUntil: expiry,
      }),
      trainings: [],
      flights: [],
      window: expiryWindow(REPORT_DAY, warningDays),
    }).licence_status

  it('reads an expiry inside the window differently from one outside it', () => {
    expect(inside(40)).toBe(t('report.pilot.certificateStatus.expiring'))
    expect(inside(10)).toBe(t('report.pilot.certificateStatus.valid'))
  })

  it('answers a non-default window with the state that window implies', () => {
    // a 60-day window reaches an expiry the default does not, which is the mutation the
    // tenancy suite runs end to end against a non-default fixture value
    expect(inside(60)).toBe(t('report.pilot.certificateStatus.expiring'))
  })
})

describe('the two boundaries of the window, each of which is a decision', () => {
  it('counts the last day: an expiry falling on the reporting day is not expired', () => {
    // flip the expired comparison to `<=` and this is the test that goes red
    expect(held('2026-08-15').licence_status).toBe(t('report.pilot.certificateStatus.expiring'))
    expect(held('2026-08-14').licence_status).toBe(t('report.pilot.certificateStatus.expired'))
  })

  it('counts the window edge: an expiry falling on the last warned day is inside it', () => {
    // 40 days after 2026-08-15. flip the window comparison to `<` and this goes red
    expect(held('2026-09-24').licence_status).toBe(t('report.pilot.certificateStatus.expiring'))
    expect(held('2026-09-25').licence_status).toBe(t('report.pilot.certificateStatus.valid'))
  })
})

describe('an absence is never an expiry that has passed, and never a pass either', () => {
  it('reads a certificate with no expiry as no-expiry, distinct from valid and from expired', () => {
    const noExpiry = held(null).licence_status

    expect(noExpiry).toBe(t('report.pilot.certificateStatus.noExpiry'))
    expect(noExpiry).not.toBe(held('2027-06-30').licence_status)
    expect(noExpiry).not.toBe(held('2026-01-01').licence_status)

    // and no date is printed beside it, because there is no expiry rather than one nobody
    // recorded
    expect(held(null).licence_date).toBeNull()
  })

  it('reads no certificate at all as its own answer, not as a certificate that never expires', () => {
    const none = pilotReportRow({
      pilot: testPerson(),
      trainings: [],
      flights: [],
      window: testWindow(),
    })

    expect(none.licence_status).toBe(t('report.pilot.certificateStatus.none'))
    expect(none.licence_status).not.toBe(held(null).licence_status)
    expect(none.licence_number).toBeNull()
    expect(none.licence_types).toEqual([])
  })

  // a row carrying only an expiry is a certificate somebody recorded badly, not a pilot who
  // holds none. reading it as an absence rendered a lapse as a gap and printed the expiry
  // beside the denial of it - the row contradicting itself in two keys.
  it('reads an expiry with no number and no types as a certificate, not as an absence', () => {
    const expiryOnly = pilotReportRow({
      pilot: testPerson({ certificateValidUntil: '2020-01-01' }),
      trainings: [],
      flights: [],
      window: testWindow(),
    })

    expect(expiryOnly.licence_status).toBe(t('report.pilot.certificateStatus.expired'))
    expect(expiryOnly.licence_status).not.toBe(t('report.pilot.certificateStatus.none'))

    // the two keys that used to disagree
    expect(expiryOnly.licence_date).toBe('2020-01-01')
  })

  it('reads no training at all as a gap, with both headline nulls beside it', () => {
    const none = pilotReportRow({
      pilot: testPerson(),
      trainings: [],
      flights: [],
      window: testWindow(),
    })

    expect(none.training_status).toBe(t('report.pilot.trainingStatus.none'))
    expect(none.training_date).toBeNull()
    expect(none.training_name).toBeNull()
  })

  it('keeps a pilot with no e-mail on the roster, with the absence labelled', () => {
    const row = pilotReportRow({
      pilot: testPerson({ email: null }),
      trainings: [],
      flights: [],
      window: testWindow(),
    })

    // `person.email` is nullable and load-bearing while the oracle types this key non-null.
    // never `""`, and never anything shaped like an address.
    expect(row.email).toBe(t('report.pilot.email.none'))
    expect(row.email).not.toBe('')
    expect(row.email).not.toContain('@')
  })
})

describe('the headline training is the one that lapses soonest', () => {
  const headline = (trainings: Parameters<typeof pilotReportRow>[0]['trainings']) =>
    pilotReportRow({ pilot: testPerson(), trainings, flights: [], window: testWindow() })

  it('takes the nearest expiry, so a lapse cannot hide behind a valid record', () => {
    const row = headline([
      pilotTraining({ name: 'Placeholder Later Training', validUntil: '2028-01-01' }),
      pilotTraining({ name: 'Placeholder Lapsed Training', validUntil: '2026-01-01' }),
    ])

    expect(row.training_name).toBe('Placeholder Lapsed Training')
    expect(row.training_date).toBe('2026-01-01')
    expect(row.training_status).toBe(t('report.pilot.trainingStatus.expired'))
  })

  it('takes a training that never expires only where nothing the pilot holds expires', () => {
    const alongside = headline([
      pilotTraining({ name: 'Placeholder Open Training', validUntil: null }),
      pilotTraining({ name: 'Placeholder Expiring Training', validUntil: '2026-09-01' }),
    ])
    const alone = headline([pilotTraining({ name: 'Placeholder Open Training', validUntil: null })])

    expect(alongside.training_name).toBe('Placeholder Expiring Training')
    expect(alone.training_name).toBe('Placeholder Open Training')
    expect(alone.training_status).toBe(t('report.pilot.trainingStatus.noExpiry'))
    expect(alone.training_date).toBeNull()
  })

  it('gives training and certificate separate keys, even where the two read alike today', () => {
    const row = headline([pilotTraining({ validUntil: '2026-09-01' })])

    // both nouns are neuter in the rebuild's vocabulary, so both valid states read the same
    // string. separate keys is what keeps that an accident of this catalogue rather than a
    // property a translator would have to preserve.
    expect(row.training_status).toBe(t('report.pilot.trainingStatus.expiring'))
    expect(t('report.pilot.trainingStatus.expiring')).not.toBe(
      t('report.pilot.trainingStatus.valid'),
    )
  })
})

describe('the period totals a pilot carries, and the arrays they are counted from', () => {
  const flown = pilotReportRow({
    pilot: testPerson(),
    trainings: [],
    flights: [
      pilotFlight({ id: 1, deviceId: 1, seconds: 5100 }),
      pilotFlight({ id: 2, deviceId: 1, seconds: 1800 }),
      pilotFlight({ id: 3, deviceId: 2, serialNumber: 'SN-PLACEHOLDER-0002', seconds: 3600 }),

      // no airframe: it lists among the flights and groups under none
      pilotFlight({ id: 4, deviceId: null, seconds: 900 }),
    ],
    window: testWindow(),
  })

  it('states one quantity in two units, and the mean beside it', () => {
    // 11400 s over four flights
    expect(flown.flights_count).toBe(4)
    expect(flown.total_minutes).toBe(190)
    expect(flown.total_hours).toBe(3.17)
    expect(flown.avg_minutes).toBe(48)
    expect(flown.avg_hours).toBe(0.79)
  })

  it('groups by airframe without dropping the flight that names none', () => {
    expect(flown.filtered_flights.map((flight) => flight.id)).toEqual([1, 2, 3, 4])
    expect(flown.flights_by_device.flatMap((group) => group.flights.map((it) => it.id))).toEqual([
      1, 2, 3,
    ])
    expect(flown.flights_by_device.map((group) => group.total_flight_hours)).toEqual([1.92, 1])
  })

  it('answers zero flights with zeroes, not with a null and not with a division by zero', () => {
    const quiet = pilotReportRow({
      pilot: testPerson(),
      trainings: [],
      flights: [],
      window: testWindow(),
    })

    expect([quiet.flights_count, quiet.total_minutes, quiet.total_hours]).toEqual([0, 0, 0])
    expect([quiet.avg_minutes, quiet.avg_hours]).toEqual([0, 0])
    expect(Number.isNaN(quiet.avg_hours)).toBe(false)
  })
})
