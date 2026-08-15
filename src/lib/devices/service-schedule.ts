import type { DeviceType } from '@/lib/db/schema'

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
