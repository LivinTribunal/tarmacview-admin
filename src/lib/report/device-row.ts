import type { Device, DeviceType, MaintenanceLog } from '@/lib/db/schema'
import {
  serviceState,
  vlosLimit,
  type ServiceReadings,
  type ServiceState,
} from '@/lib/devices/service-schedule'
import { t, type MessageKey } from '@/lib/i18n'

// serialises one airframe into the shape the operator report's data.devices[] block
// carries. contracts/report-schema.json is the oracle for the key set and the types;
// parity there is schema parity, never value parity.

export type AirframeReportInput = {
  device: Device
  deviceType: DeviceType | null
  readings: ServiceReadings
  // period-filtered totals, grouped from the same rows data.flights[] is serialised from
  totals: { flights: number; flightHours: number; lastFlightDate: Date | null }
  // the maintenance history as the technician stated it, newest first
  maintenance: readonly MaintenanceLog[]
}

// the oracle carries no key path below `maintenance_logs[]` - every captured one was empty,
// Observed - so this member shape is the rebuild's own and parity claims only that the key
// exists and is an array. it mirrors docs/specs/03-data-model.md §MaintenanceLog's field
// list rather than guessing at oracle-shaped names for keys nothing ever observed.
export type MaintenanceLogRow = {
  id: number
  maintenance_date: string
  total_flight_hours: string
  total_flights: number | null
  maintenance_performed_by: string | null
  fault_and_maintenance_description: string | null
  preflight_check_performed_by: string | null
}

export type DeviceReportRow = {
  id: number
  name: string | null
  serial_number: string
  model: string | null
  manufacturer: string | null
  notes: string | null
  type: string
  status: string
  max_vlos_meters: string | null
  maintenance_instructions: string | null
  maintenance_logs: readonly MaintenanceLogRow[]
  last_flight_date: string | null
  lifetime_flights_count: number
  total_flights: number
  total_flight_hours: number
  service_is_configured: boolean
  service_due: boolean
  service_due_reasons: readonly string[]
  service_interval_cycles: number | null
  service_lifetime_cycles: number
  service_baseline_cycles: number
  next_service_at_cycles: number | null
  service_remaining_cycles: number | null
  service_overdue_cycles: number | null
  service_interval_months: number | null
  service_calendar_baseline_date: string | null
  next_service_date: string | null
  service_remaining_days: number | null
  service_overdue_days: number | null
  service_warning: string | null
}

const statusLabel: Record<Device['status'], MessageKey> = {
  active: 'device.status.active',
  inactive: 'device.status.inactive',
  maintenance: 'device.status.maintenance',
  retired: 'device.status.retired',
}

const gapWarning: Record<Extract<ServiceState, { configured: false }>['gap'], MessageKey> = {
  no_device_type: 'device.warning.noDeviceType',
  no_interval_on_device_type: 'device.warning.noServiceInterval',
}

const isoDate = (date: Date | null): string | null =>
  date === null ? null : date.toISOString().slice(0, 10)

// the missing configuration is stated in the row rather than left to be inferred from
// nulls, so an unconfigured airframe reads as a gap and never as a clean sheet.
function warning(state: ServiceState): string | null {
  if (!state.configured) return t(gapWarning[state.gap])
  return state.due ? t('device.warning.serviceDue') : null
}

// the record as stated, never recomputed: `total_flights` stays null where the technician
// stated none, because a zero there would be a reading nobody took.
function statedMaintenance(log: MaintenanceLog): MaintenanceLogRow {
  return {
    id: log.id,
    maintenance_date: log.maintenanceDate,
    total_flight_hours: log.totalFlightHours,
    total_flights: log.totalFlights,
    maintenance_performed_by: log.maintenancePerformedBy,
    fault_and_maintenance_description: log.faultAndMaintenanceDescription,
    preflight_check_performed_by: log.preflightCheckPerformedBy,
  }
}

export function airframeReportRow(input: AirframeReportInput): DeviceReportRow {
  const { device, deviceType, readings, totals } = input
  const state = serviceState(deviceType, readings)
  const limit = vlosLimit(deviceType)

  return {
    id: device.id,
    name: device.name,
    serial_number: device.serialNumber,
    model: device.model,
    manufacturer: device.manufacturer,
    notes: device.notes,
    type: deviceType?.name ?? t('device.type.unassigned'),
    status: t(statusLabel[device.status]),

    // a string, because the oracle serialises it as one across every captured row. a
    // rebuild that "corrects" it to a number fails parity, and the oracle is right.
    max_vlos_meters: limit.configured ? String(limit.metres) : null,

    maintenance_instructions: deviceType?.maintenanceInstructions ?? null,

    // the history itself and not an empty array: an airframe that has been serviced
    // serialising `[]` here would be a gap reading as a fact, which is why R1 declared this
    // whole block pending rather than sending it empty. the member shape above is ours.
    maintenance_logs: input.maintenance.map(statedMaintenance),

    last_flight_date: isoDate(totals.lastFlightDate),

    // one cycle is one recorded flight, so the lifetime cycle count is the lifetime
    // flight count - the same number under two names, as the payload has it
    lifetime_flights_count: readings.lifetimeCycles,
    total_flights: totals.flights,
    total_flight_hours: totals.flightHours,

    service_is_configured: state.configured,
    service_due: state.configured ? state.due : false,
    service_due_reasons: state.configured
      ? state.reachedLimits.map((reached) => t(`device.serviceLimit.${reached}`))
      : [],
    service_interval_cycles: state.configured ? state.intervalCycles : null,
    service_lifetime_cycles: readings.lifetimeCycles,
    service_baseline_cycles: readings.baselineCycles,
    next_service_at_cycles: state.configured ? state.nextAtCycles : null,
    service_remaining_cycles: state.configured ? state.remainingCycles : null,
    service_overdue_cycles: state.configured ? state.overdueCycles : null,
    service_interval_months: state.configured ? state.intervalMonths : null,
    service_calendar_baseline_date: isoDate(readings.baselineDate),
    next_service_date: state.configured ? isoDate(state.nextDate) : null,
    service_remaining_days: state.configured ? state.remainingDays : null,
    service_overdue_days: state.configured ? state.overdueDays : null,
    service_warning: warning(state),
  }
}
