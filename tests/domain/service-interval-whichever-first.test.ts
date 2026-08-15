import { describe, expect, it } from 'vitest'
import { serviceState } from '@/lib/devices/service-schedule'
import { configuredType, readings } from '../support/airframes'

// this suite tests the rebuild's own implementation of the dual-interval rule, not
// agreement with the predecessor. it has no oracle subject: data.devices[]
// .service_interval_months is null in all 216 captured airframe rows, so the calendar
// half was never exercised by any captured organisation
// (docs/specs/03-data-model.md §Device). the rule itself is Observed, from the helper
// text in docs/specs/04-admin-resources.md.

const cyclesOnly = () => configuredType({ serviceInterval: 50, serviceIntervalMonths: null })
const monthsOnly = () => configuredType({ serviceInterval: null, serviceIntervalMonths: 12 })
const dualInterval = () => configuredType({ serviceInterval: 50, serviceIntervalMonths: 12 })

describe("the rebuild's own rule: a service interval fires on whichever limit is reached first", () => {
  it('fires on cycles when the cycle limit is reached first', () => {
    const state = serviceState(
      dualInterval(),
      readings({
        lifetimeCycles: 50,
        baselineDate: new Date('2026-06-01T00:00:00Z'),
        asOf: new Date('2026-08-15T00:00:00Z'),
      }),
    )

    expect(state).toMatchObject({ configured: true, due: true, reachedLimits: ['cycles'] })
  })

  it('fires on calendar months when the calendar limit is reached first', () => {
    const state = serviceState(
      dualInterval(),
      readings({
        lifetimeCycles: 3,
        baselineDate: new Date('2025-01-01T00:00:00Z'),
        asOf: new Date('2026-08-15T00:00:00Z'),
      }),
    )

    expect(state).toMatchObject({ configured: true, due: true, reachedLimits: ['months'] })
  })

  it('names both limits when both have been reached', () => {
    const state = serviceState(
      dualInterval(),
      readings({
        lifetimeCycles: 80,
        baselineDate: new Date('2024-01-01T00:00:00Z'),
        asOf: new Date('2026-08-15T00:00:00Z'),
      }),
    )

    expect(state).toMatchObject({ configured: true, due: true, reachedLimits: ['cycles', 'months'] })
  })

  it('does not fire while both limits are still ahead', () => {
    const state = serviceState(
      dualInterval(),
      readings({
        lifetimeCycles: 49,
        baselineDate: new Date('2026-06-01T00:00:00Z'),
        asOf: new Date('2026-08-15T00:00:00Z'),
      }),
    )

    expect(state).toMatchObject({
      configured: true,
      due: false,
      reachedLimits: [],
      remainingCycles: 1,
      overdueCycles: 0,
    })
  })

  it('one recorded flight is one cycle, counted from the stated baseline', () => {
    const sinceLastService = readings({ baselineCycles: 120, lifetimeCycles: 169 })
    expect(serviceState(cyclesOnly(), sinceLastService)).toMatchObject({
      due: false,
      nextAtCycles: 170,
      remainingCycles: 1,
    })

    // the 170th recorded flight is the 50th cycle since the baseline
    expect(
      serviceState(cyclesOnly(), { ...sinceLastService, lifetimeCycles: 170 }),
    ).toMatchObject({ due: true, reachedLimits: ['cycles'], remainingCycles: 0 })
  })

  it('a calendar interval with no baseline date has no date to count from and cannot fire', () => {
    const state = serviceState(monthsOnly(), readings({ baselineDate: null, lifetimeCycles: 900 }))

    expect(state).toMatchObject({ configured: true, due: false, nextDate: null, remainingDays: null })
  })

  it('counts calendar months from the baseline, clamping a short target month', () => {
    const state = serviceState(
      configuredType({ serviceInterval: null, serviceIntervalMonths: 1 }),
      readings({
        baselineDate: new Date('2026-01-31T00:00:00Z'),
        asOf: new Date('2026-02-27T00:00:00Z'),
      }),
    )

    expect(state).toMatchObject({ configured: true, due: false, remainingDays: 1 })
  })
})
