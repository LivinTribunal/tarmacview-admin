import { describe, expect, it } from 'vitest'
import { serviceState, vlosLimit } from '@/lib/devices/service-schedule'
import { airframeReportRow } from '@/lib/report/device-row'
import { configuredType, readings, testAirframe } from '../support/airframes'

// an airframe with no device type has no VLOS limit and no service interval, so it can
// never register a violation and never raise a service warning. surfacing that gap is
// the requirement; letting it read as compliant is the defect.

describe('an airframe with no device type reports no limit configured', () => {
  it('has no service interval, and no due flag that could read as a pass', () => {
    const state = serviceState(null, readings({ lifetimeCycles: 5_000 }))

    expect(state.configured).toBe(false)
    expect(state).toEqual({ configured: false, gap: 'no_device_type' })
    // there is no `due` to misread - the unconfigured state does not carry one
    expect('due' in state).toBe(false)
  })

  it('has no VLOS limit, so no flight of it can be a violation', () => {
    expect(vlosLimit(null)).toEqual({ configured: false })
  })

  it('reports the gap the same way when the type exists but sets no interval', () => {
    const state = serviceState(
      { maxVlos: '500', serviceInterval: null, serviceIntervalMonths: null },
      readings({ lifetimeCycles: 5_000 }),
    )
    expect(state).toEqual({ configured: false, gap: 'no_interval_on_device_type' })
  })

  it('says so in the report row instead of serialising as a clean sheet', () => {
    const row = airframeReportRow({
      device: testAirframe({ deviceTypeId: null }),
      deviceType: null,
      readings: readings({ lifetimeCycles: 5_000 }),
      totals: { flights: 12, flightHours: 9.5, lastFlightDate: new Date('2026-08-01T00:00:00Z') },
    })

    expect(row.service_is_configured).toBe(false)
    expect(row.max_vlos_meters).toBeNull()
    expect(row.service_due_reasons).toEqual([])
    expect(row.service_warning).not.toBeNull()
  })

  it('is distinguishable from an airframe that is configured and simply not due', () => {
    const gap = airframeReportRow({
      device: testAirframe({ deviceTypeId: null }),
      deviceType: null,
      readings: readings({ lifetimeCycles: 5_000 }),
      totals: { flights: 0, flightHours: 0, lastFlightDate: null },
    })
    const withinInterval = airframeReportRow({
      device: testAirframe({}),
      deviceType: configuredType(),
      readings: readings({ lifetimeCycles: 10 }),
      totals: { flights: 0, flightHours: 0, lastFlightDate: null },
    })

    // both are "not due", and that is exactly why service_due cannot be the field a
    // reader relies on
    expect(gap.service_due).toBe(withinInterval.service_due)
    expect(gap.service_is_configured).toBe(false)
    expect(withinInterval.service_is_configured).toBe(true)
    expect(withinInterval.service_warning).toBeNull()
    expect(gap.service_warning).not.toBeNull()
  })
})
