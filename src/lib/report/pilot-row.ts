import type { Person } from '@/lib/db/schema'
import { t } from '@/lib/i18n'
import { flightHours, type FlightReportRow } from '@/lib/report/flight-row'

// serialises one pilot into the shape the operator report's data.pilots[] block carries,
// beside the airframe serialiser in device-row.ts and the flight serialiser in
// flight-row.ts and shaped against both. contracts/report-schema.json is the oracle for the
// key set, the types and the nesting; parity there is schema parity, never value parity.
//
// four payload keys are spelled `licence_*` and stay that way: they are the oracle's names
// and parity freezes them, and the contract is never edited to agree with us. everything
// else here says **certificate**, which is CONTEXT.md's term - the pair was translated once,
// deliberately, and the synonym is not reintroduced. docs/specs/06-org-report.md carries the
// split so the report page does not undo it when it renders the column.

// the day the report is being run for and the last day still inside the organisation's
// warning window, both as `YYYY-MM-DD`. a `date` column arrives as one and iso days compare
// lexicographically, so a status is two string comparisons and the whole off-by-one risk
// sits in one place.
export type ExpiryWindow = { today: string; lastWarningDay: string }

// the four states a stated expiry can be in. `noExpiry` is a stated fact and `none` below
// is a gap, and collapsing the two would let a gap read as a fact.
type StatedExpiry = 'valid' | 'expiring' | 'expired' | 'noExpiry'

// plus the record that does not exist at all - no training held, no certificate recorded
type ExpiryStatus = StatedExpiry | 'none'

export type PilotTrainingInput = {
  name: string
  // null where the training is unclassified, which is a gap and never a pass
  trainingTypeName: string | null
  heldOn: string | null
  validUntil: string | null
  airframes: readonly string[] | null
}

export type PilotFlightInput = {
  // the recorded seconds, so the totals below are derived from the same quantity the
  // envelope's are rather than from an already-rounded figure
  seconds: number | null
  // the row data.flights[] is serialised from, so the two blocks cannot disagree about
  // which flights fall in the window a reader selected
  row: FlightReportRow
}

export type PilotReportInput = {
  pilot: Person
  // every training the pilot holds, **all-time** and never period-filtered: a qualification
  // does not stop existing because the reader picked last month
  trainings: readonly PilotTrainingInput[]
  // the pilot's flights in the period
  flights: readonly PilotFlightInput[]
  window: ExpiryWindow
}

// the six keys the oracle carries under both nested flight arrays - a *subset* of
// FlightReportRow, picked rather than spread. handing the whole row over would serialise
// nine keys the oracle does not carry here and fail the no-invented-keys assertion.
export type PilotFlightRow = Pick<
  FlightReportRow,
  | 'id'
  | 'device_serial_number'
  | 'device_model'
  | 'flight_hours'
  | 'flight_date_display'
  | 'flight_date_sort'
>

export type PilotDeviceRow = {
  device_serial_number: string
  device_model: string
  flights: readonly PilotFlightRow[]
  total_flights: number
  total_flight_hours: number
}

export type PilotTrainingRow = {
  name: string
  training_type: string
  date_start: string
  date_end: string | null
  devices: readonly string[]
  status: string
}

export type PilotReportRow = {
  id: number
  name: string
  email: string
  flights_count: number
  total_minutes: number
  total_hours: number
  avg_minutes: number
  avg_hours: number
  training_status: string
  training_date: string | null
  training_name: string | null
  licence_status: string
  licence_date: string | null
  licence_types: readonly string[]
  licence_number: string | null
  trainings: readonly PilotTrainingRow[]
  filtered_flights: readonly PilotFlightRow[]
  flights_by_device: readonly PilotDeviceRow[]
}

const DAY_MS = 24 * 60 * 60 * 1000

const isoDay = (at: Date): string => at.toISOString().slice(0, 10)

// the organisation's own window, resolved once per payload to the last day still inside it.
// src/lib/devices/service-schedule.ts holds the only other day arithmetic in the repo, so
// this is the second site - two copies is where src/lib/routes/identifier.ts records
// extraction as not yet earned, and it stays local until a third caller appears.
export function expiryWindow(asOf: Date, warningDays: number): ExpiryWindow {
  return {
    today: isoDay(asOf),
    lastWarningDay: isoDay(new Date(asOf.getTime() + warningDays * DAY_MS)),
  }
}

// both comparisons are inclusive, and both boundaries are decisions rather than accidents:
// an expiry falling **on** the reporting day is still valid, because the last day counts,
// and one falling **on** the window's own edge is inside it. flip either and exactly one
// named test in tests/domain/pilot-expiry-window.test.ts turns red.
function statedExpiry(validUntil: string | null, window: ExpiryWindow): StatedExpiry {
  if (validUntil === null) return 'noExpiry'
  if (validUntil < window.today) return 'expired'
  return validUntil <= window.lastWarningDay ? 'expiring' : 'valid'
}

// the training the three headline keys describe: the one that lapses soonest, because the
// report exists to surface what needs renewing. a training that never expires can never be
// that one and sorts last, so it is the headline only where the pilot holds nothing that
// expires at all.
//
// the cost is deliberate and recorded in docs/specs/06-org-report.md: an expired record the
// pilot has since renewed keeps the headline expired until it is removed. taking the latest
// expiry instead would let a lapse hide behind a valid record, which is the gap reading as
// a pass this repo rules out everywhere else.
function soonestToLapse(trainings: readonly PilotTrainingInput[]): PilotTrainingInput | null {
  const expiring = trainings.filter((training) => training.validUntil !== null)
  if (expiring.length === 0) return trainings[0] ?? null

  return expiring.reduce((soonest, training) =>
    (training.validUntil ?? '') < (soonest.validUntil ?? '') ? training : soonest,
  )
}

const flown = (row: FlightReportRow): PilotFlightRow => ({
  id: row.id,
  device_serial_number: row.device_serial_number,
  device_model: row.device_model,
  flight_hours: row.flight_hours,
  flight_date_display: row.flight_date_display,
  flight_date_sort: row.flight_date_sort,
})

type DeviceGroup = { serialNumber: string; model: string; flights: PilotFlightRow[]; seconds: number }

// grouped from the rows data.flights[] already carries rather than queried again, which
// makes the agreement structural instead of a property two reads have to keep. a flight
// naming no airframe lists in filtered_flights[] and groups under nothing - R2's rule for
// data.devices[] one table over, and never a dropped flight.
function byAirframe(flights: readonly PilotFlightInput[]): PilotDeviceRow[] {
  const groups = new Map<number, DeviceGroup>()

  for (const { seconds, row } of flights) {
    if (row.device_id === null) continue
    const group = groups.get(row.device_id) ?? {
      serialNumber: row.device_serial_number,
      model: row.device_model,
      flights: [],
      seconds: 0,
    }

    group.flights.push(flown(row))
    group.seconds += seconds ?? 0
    groups.set(row.device_id, group)
  }

  return [...groups.values()].map((group) => ({
    device_serial_number: group.serialNumber,
    device_model: group.model,
    flights: group.flights,
    total_flights: group.flights.length,
    total_flight_hours: flightHours(group.seconds),
  }))
}

function trainingRow(training: PilotTrainingInput, window: ExpiryWindow): PilotTrainingRow {
  return {
    name: training.name,

    // both of these are non-null in the oracle over columns that are nullable, so each
    // absence is named rather than blanked. an unclassified training and one whose date was
    // never recorded are gaps, and a blank string would state neither.
    training_type: training.trainingTypeName ?? t('report.pilot.training.unclassified'),
    date_start: training.heldOn ?? t('report.pilot.training.noDate'),

    date_end: training.validUntil,

    // an array either way. only 3 of the 326 captured trainings covered an airframe, and
    // that sparsity is a fact about the records rather than a reason to omit the key.
    devices: training.airframes ?? [],

    status: t(`report.pilot.trainingStatus.${statedExpiry(training.validUntil, window)}`),
  }
}

export function pilotReportRow(input: PilotReportInput): PilotReportRow {
  const { pilot, trainings, flights, window } = input

  const seconds = flights.reduce((total, flight) => total + (flight.seconds ?? 0), 0)

  // a mean over the period, and no flights is zero rather than a null or a division by
  // zero - the oracle types both non-null numbers. one quantity in two units on both
  // rows, each derived from the seconds rather than from the other, which is the
  // relationship the envelope's totals already have.
  const averageSeconds = flights.length === 0 ? 0 : seconds / flights.length

  const headline = soonestToLapse(trainings)

  // a certificate exists where either half of it was recorded. distinguishing that from a
  // person carrying none is what keeps `Bez expirácie` off a pilot who has no certificate
  // at all - docs/specs/03-data-model.md §"Certificates in the rebuild" records the empty
  // type list as a gap. all three columns count: a row carrying only an expiry is a
  // certificate somebody recorded badly, not a pilot who holds none, and reading it as an
  // absence would render a lapse as a gap and print the expiry beside the denial of it.
  const certificate =
    pilot.certificateNumber !== null ||
    pilot.certificateTypes.length > 0 ||
    pilot.certificateValidUntil !== null

  const certificateStatus: ExpiryStatus = certificate
    ? statedExpiry(pilot.certificateValidUntil, window)
    : 'none'

  return {
    id: pilot.id,
    name: pilot.name,

    // `email` is nullable and load-bearing - a pilot may exist with no e-mail and no
    // credentials - while the oracle types this key a non-null string. so the absence gets
    // a label naming it, never `""` and never something shaped like an address.
    email: pilot.email ?? t('report.pilot.email.none'),

    flights_count: flights.length,
    total_minutes: Math.round(seconds / 60),
    total_hours: flightHours(seconds),
    avg_minutes: Math.round(averageSeconds / 60),
    avg_hours: flightHours(averageSeconds),

    // the headline training and its expiry. a pilot holding none reports the gap and two
    // nulls beside it; one whose training never expires reports that state and a null date,
    // because there is no expiry to print rather than an expiry that has passed.
    training_status: t(
      `report.pilot.trainingStatus.${headline === null ? 'none' : statedExpiry(headline.validUntil, window)}`,
    ),
    training_date: headline?.validUntil ?? null,
    training_name: headline?.name ?? null,

    licence_status: t(`report.pilot.certificateStatus.${certificateStatus}`),

    // iso, like `flight_date`. the oracle gives this key no `_display` sibling the way the
    // flight's date has, so the format it was rendered in is undecidable from the capture -
    // the report page renders it through formatDate, as it does every other date.
    licence_date: pilot.certificateValidUntil,
    licence_types: pilot.certificateTypes.map((type) => t(`person.certificateType.${type}`)),
    licence_number: pilot.certificateNumber,

    trainings: trainings.map((training) => trainingRow(training, window)),
    filtered_flights: flights.map(({ row }) => flown(row)),
    flights_by_device: byAirframe(flights),
  }
}
