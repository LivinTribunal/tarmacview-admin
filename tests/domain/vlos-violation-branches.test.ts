import { describe, expect, it } from 'vitest'
import { flightReportRow } from '@/lib/report/flight-row'
import { testFlight, testFlightInput } from '../support/flights'

// `has_vlos_violation` is false in three different situations and only one of them is a
// pass. the oracle gives the flights block no fourth key, so the three are asserted
// separately here and the two gaps are shown to be distinguishable in the payload without
// widening the boolean - docs/specs/06-org-report.md §"The data endpoint in the rebuild".

const withinTheLimit = testFlightInput({
  flight: testFlight({ maxDistanceMeters: '420.25' }),
  deviceType: { maxVlos: '500' },
})

const noDeviceType = testFlightInput({
  flight: testFlight({ maxDistanceMeters: '420.25' }),
  deviceType: null,
})

const nothingRecorded = testFlightInput({
  flight: testFlight({ maxDistanceMeters: null }),
  deviceType: { maxVlos: '500' },
})

describe('the VLOS judgement: one violation, and three ways to be false', () => {
  it('flags a flight that went past the limit', () => {
    const row = flightReportRow(
      testFlightInput({ flight: testFlight({ maxDistanceMeters: '640' }) }),
    )
    expect(row.has_vlos_violation).toBe(true)
  })

  it('is false within the limit, which is the one branch that is a pass', () => {
    expect(flightReportRow(withinTheLimit).has_vlos_violation).toBe(false)
  })

  it('is false with no device type, because there is no limit to judge against', () => {
    // the repo's standing rule: an airframe with no device type has no VLOS limit, so no
    // flight of it can ever register a violation. that is a gap, never a clean sheet.
    expect(flightReportRow(noDeviceType).has_vlos_violation).toBe(false)
  })

  // a stated ceiling, because this one asserts less than it looks like it does. it pins the
  // *behaviour* and not the guard behind it: `Number(null)` is 0 and 0 cannot exceed a
  // non-negative limit, so deleting `maxDistanceMeters !== null` from the judgement leaves
  // this green - measured, 535 passed, exit 0. the guard stays because it names the third
  // branch outright and keeps holding if how a null serialises ever changes; what no test
  // here can claim is that it is load-bearing today.
  it('is false with no distance recorded, because there is nothing to judge', () => {
    expect(flightReportRow(nothingRecorded).has_vlos_violation).toBe(false)
  })
})

describe('what the boolean alone cannot say, which is why R4 must not read it as an all-clear', () => {
  it('a device type with no VLOS limit reaches the gap branch too, not a pass', () => {
    const noLimitOnType = testFlightInput({
      flight: testFlight({ maxDistanceMeters: '640' }),
      deviceType: { maxVlos: null },
    })

    // 640 is past the limit the same flight is flagged on above, so this false is the
    // missing limit and not the distance
    expect(flightReportRow(noLimitOnType).has_vlos_violation).toBe(false)
  })

  it('answers the pass and both gaps identically, so the flights table must not render it as one', () => {
    const judged = [withinTheLimit, noDeviceType, nothingRecorded].map(flightReportRow)
    expect(judged.map((row) => row.has_vlos_violation)).toEqual([false, false, false])

    // the payload's place for the difference is data.devices[]'s `max_vlos_meters` and
    // `service_warning`, both already written in device-row.ts and wired by R2. widening
    // this key instead would fail parity, and inventing a fourth would too.
  })

  it('serialises a null distance as zero without letting the judgement see the zero', () => {
    // decision 3's exception: the serialised figure holds parity, and the comparison reads
    // the column, so a flight that recorded nothing is not one that recorded a zero
    expect(flightReportRow(nothingRecorded).max_distance).toBe(0)
    expect(
      flightReportRow(testFlightInput({ flight: testFlight({ maxDistanceMeters: '0' }) }))
        .max_distance,
    ).toBe(0)
  })
})
