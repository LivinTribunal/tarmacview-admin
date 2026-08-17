import type { DeviceType, MaintenanceLog } from '@/lib/db/schema'

// the airframe's service state and VLOS limit, both of which live on its device type.
// pure functions over stated figures: nothing here reads the database and nothing
// recomputes a maintenance reading. one cycle is one recorded flight.

export type ServiceReadings = {
  // stated at the last maintenance, and the all-time total. both are readings, not
  // derivations - the technician's figures are the record.
  baselineCycles: number
  lifetimeCycles: number
  baselineDate: Date | null
  asOf: Date
}

export type ServiceLimit = 'cycles' | 'months'

// the gap an airframe with no service interval has, named rather than collapsed into
// "not due". a caller cannot read `configured: false` as a pass, because there is no
// `due` field on that branch to read as false.
export type ServiceGap = 'no_device_type' | 'no_interval_on_device_type'

export type ServiceState =
  | { configured: false; gap: ServiceGap }
  | {
      configured: true
      due: boolean
      reachedLimits: readonly ServiceLimit[]
      intervalCycles: number | null
      nextAtCycles: number | null
      remainingCycles: number | null
      overdueCycles: number | null
      intervalMonths: number | null
      nextDate: Date | null
      remainingDays: number | null
      overdueDays: number | null
    }

export type VlosLimit = { configured: false } | { configured: true; metres: number }

type ServiceFields = Pick<DeviceType, 'maxVlos' | 'serviceInterval' | 'serviceIntervalMonths'>

const DAY_MS = 24 * 60 * 60 * 1000

// clamps the day when the target month is shorter, so 31 January plus one month is the
// last day of february rather than a silent roll into march.
function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate()
  const shifted = new Date(from.getTime())
  shifted.setUTCDate(1)
  shifted.setUTCMonth(shifted.getUTCMonth() + months)
  const lastDayOfTargetMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate()
  shifted.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return shifted
}

function positiveOrNull(value: number | null): number | null {
  return value !== null && value > 0 ? value : null
}

// a `date` column arrives as `YYYY-MM-DD` and a baseline is an instant, so the two are
// converted here in UTC - the convention formatDate already holds. handing the string on
// untouched gets it as far as addMonths, which answers an invalid date nothing would notice.
const utcDay = (value: string): Date => new Date(`${value}T00:00:00Z`)

// what a maintenance record contributes to the baseline: the date the service happened and
// the cycle count the technician stated, which may be none.
export type StatedMaintenance = Pick<MaintenanceLog, 'maintenanceDate' | 'totalFlights'>

export type ReadingsInput = {
  // the airframe's maintenance history. order does not matter - this composes newest-first
  // itself, so a caller that hands them over the other way round cannot take a baseline
  // from an older reading than the newest.
  maintenance: readonly StatedMaintenance[]
  // the all-time recorded flight count, which is the all-time cycle count under CONTEXT.md's
  // other name for it
  lifetimeCycles: number
  // the date of the airframe's first recorded flight, derived and not stored -
  // docs/specs/03-data-model.md §"Flights in the rebuild". the calendar fallback where the
  // airframe has never been serviced.
  firstFlightDate: Date | null
  asOf: Date
}

// the baseline, composed from **stated readings only**. every figure here was certified by
// a technician or is absent; nothing is recomputed from the airframe's own flight history,
// which is the rule this module exists to hold.
//
// the two halves come from different records on purpose. the calendar baseline is the newest
// maintenance date, because a service that stated no cycle count still happened. the cycle
// baseline is the newest count anybody actually stated: zeroing it because the newest record
// omitted one would report a just-serviced airframe as hundreds of cycles overdue, and
// carrying the lifetime count into it would invent the technician's figure. **0 where no
// record ever stated one** is the reading itself and not a fallback - an airframe never
// serviced had zero cycles at its last service.
export function serviceReadings(input: ReadingsInput): ServiceReadings {
  const history = [...input.maintenance].sort((a, b) =>
    b.maintenanceDate.localeCompare(a.maintenanceDate),
  )
  const stated = history.find((entry) => entry.totalFlights !== null)

  return {
    baselineCycles: stated?.totalFlights ?? 0,
    lifetimeCycles: input.lifetimeCycles,
    baselineDate: history[0] ? utcDay(history[0].maintenanceDate) : input.firstFlightDate,
    asOf: input.asOf,
  }
}

export function serviceState(
  deviceType: ServiceFields | null,
  readings: ServiceReadings,
): ServiceState {
  if (deviceType === null) return { configured: false, gap: 'no_device_type' }

  const intervalCycles = positiveOrNull(deviceType.serviceInterval)
  const intervalMonths = positiveOrNull(deviceType.serviceIntervalMonths)
  if (intervalCycles === null && intervalMonths === null) {
    return { configured: false, gap: 'no_interval_on_device_type' }
  }

  // cycles
  const nextAtCycles = intervalCycles === null ? null : readings.baselineCycles + intervalCycles
  const cyclesGap = nextAtCycles === null ? null : nextAtCycles - readings.lifetimeCycles
  const dueByCycles = cyclesGap !== null && cyclesGap <= 0

  // calendar months, counted from the last maintenance or, with none, from the first
  // recorded flight - whichever date the caller states as the baseline
  const nextDate =
    intervalMonths === null || readings.baselineDate === null
      ? null
      : addMonths(readings.baselineDate, intervalMonths)
  const daysGap =
    nextDate === null ? null : Math.ceil((nextDate.getTime() - readings.asOf.getTime()) / DAY_MS)
  const dueByMonths = daysGap !== null && daysGap <= 0

  // whichever limit is reached first fires the warning; both limits report which one it
  // was, because "due" alone does not tell a technician what to do
  const reachedLimits: ServiceLimit[] = []
  if (dueByCycles) reachedLimits.push('cycles')
  if (dueByMonths) reachedLimits.push('months')

  return {
    configured: true,
    due: reachedLimits.length > 0,
    reachedLimits,
    intervalCycles,
    nextAtCycles,
    remainingCycles: cyclesGap === null ? null : Math.max(cyclesGap, 0),
    overdueCycles: cyclesGap === null ? null : Math.max(-cyclesGap, 0),
    intervalMonths,
    nextDate,
    remainingDays: daysGap === null ? null : Math.max(daysGap, 0),
    overdueDays: daysGap === null ? null : Math.max(-daysGap, 0),
  }
}

// an airframe with no device type has no VLOS limit, so no flight of it can ever
// register a violation. that is a gap to surface, never a clean sheet.
export function vlosLimit(deviceType: Pick<DeviceType, 'maxVlos'> | null): VlosLimit {
  if (deviceType === null || deviceType.maxVlos === null) return { configured: false }
  const metres = Number(deviceType.maxVlos)
  if (!Number.isFinite(metres)) return { configured: false }
  return { configured: true, metres }
}
