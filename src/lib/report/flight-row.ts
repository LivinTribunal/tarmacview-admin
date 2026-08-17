import type { DeviceType, Flight } from '@/lib/db/schema'
import { vlosLimit } from '@/lib/devices/service-schedule'
import { formatDate, t } from '@/lib/i18n'

// serialises one flight into the shape the operator report's data.flights[] block carries,
// beside the airframe serialiser in device-row.ts and shaped against it.
// contracts/report-schema.json is the oracle for the key set and the types; parity there is
// schema parity, never value parity.

export type FlightReportInput = {
  flight: Flight
  pilotName: string | null
  airframe: { serialNumber: string; model: string | null } | null
  deviceType: Pick<DeviceType, 'maxVlos'> | null
  // the earliest leg start, null where the flight has no legs or no leg states one
  firstLegStartedAt: Date | null
}

export type FlightReportRow = {
  id: number
  pilot_id: number | null
  pilot_name: string
  device_id: number | null
  device_serial_number: string
  device_model: string
  flight_hours: number
  max_altitude: number
  max_distance: number
  flight_date: string
  flight_date_display: string
  flight_date_sort: number
  parsing_status: string
  parsing_errors: string
  has_vlos_violation: boolean
}

// the oracle types these three as non-null numbers where the columns behind them are all
// nullable, so a null serialises as 0 to hold parity. the VLOS judgement below reads the
// *column* and never this figure: a zero that has been through it is indistinguishable from
// a real zero, and the null must not be.
const measured = (value: string | null): number => (value === null ? 0 : Number(value))

// stated hours, to two decimals. used for the row and for the period total, which is the
// same quantity under two names - the relationship `lifetime_flights_count` and
// `service_lifetime_cycles` already have in device-row.ts.
export function flightHours(seconds: number | null): number {
  return Math.round(((seconds ?? 0) / 3600) * 100) / 100
}

// the three presentation variants of one instant the oracle carries, all non-null. the
// display goes through the iso day rather than the Date, because formatDate answers null on
// an instant it cannot render and none of these keys has a null to fall back on.
export function reportDate(at: Date): { iso: string; display: string; sort: number } {
  const iso = at.toISOString().slice(0, 10)
  return { iso, display: formatDate(iso) ?? iso, sort: at.getTime() }
}

export function flightReportRow(input: FlightReportInput): FlightReportRow {
  const { flight, airframe } = input

  // the earliest leg, falling back to the import instant - the derivation
  // docs/specs/03-data-model.md §"Flights in the rebuild" records. a manual entry has no
  // leg and nothing else does, so the fallback is that case and not a default.
  const at = reportDate(input.firstLegStartedAt ?? flight.createdAt)

  const limit = vlosLimit(input.deviceType)

  return {
    id: flight.id,
    pilot_id: flight.pilotId,

    // non-null text beside a null id, which is the unassigned-flight shape doc 06 describes.
    // the label covers two gaps - no pilot named, and a pilot this session cannot read - and
    // `pilot_id` is what distinguishes them.
    pilot_name: input.pilotName ?? t('report.flight.pilot.unassigned'),

    device_id: flight.deviceId,
    device_serial_number: airframe?.serialNumber ?? t('report.flight.device.unassigned'),
    device_model:
      airframe === null
        ? t('report.flight.device.unassigned')
        : (airframe.model ?? t('report.flight.device.noModel')),

    flight_hours: flightHours(flight.totalFlightTimeSeconds),
    max_altitude: measured(flight.maxAltitudeMeters),
    max_distance: measured(flight.maxDistanceMeters),

    flight_date: at.iso,
    flight_date_display: at.display,
    flight_date_sort: at.sort,

    // a null status is the manual-entry case - nothing was parsed. the oracle has this key
    // non-null, so it needs a label, and the label names the *absence* of parsing rather
    // than an outcome: reporting `processed` or a blank would state something that never
    // happened. the errors beside it are the one place a blank is honest, because no error
    // recorded is exactly what an empty message means.
    parsing_status: t(
      flight.parsingStatus === null
        ? 'flight.parsingStatus.none'
        : `flight.parsingStatus.${flight.parsingStatus}`,
    ),
    parsing_errors: flight.parsingErrors ?? '',

    // false in three different situations and only one of them is a pass: the distance is
    // within the limit, or there is no limit to judge against, or nothing was recorded to
    // judge. the oracle gives this block no fourth key and parity forbids inventing one, so
    // the gap is surfaced where a key already exists for it - data.devices[]'s
    // `max_vlos_meters` and `service_warning` - and never by overloading this boolean.
    // doc 06 carries the consequence for the flights table.
    has_vlos_violation:
      limit.configured &&
      flight.maxDistanceMeters !== null &&
      Number(flight.maxDistanceMeters) > limit.metres,
  }
}
