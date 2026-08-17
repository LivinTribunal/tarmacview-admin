import { describe, expect, it } from 'vitest'
import { flightReportRow } from '@/lib/report/flight-row'
import { testFlight, testFlightInput } from '../support/flights'

// the flight's date is derived and not stored - docs/specs/03-data-model.md §"Flights in
// the rebuild". the fallback order is the whole of the decision, so it is asserted branch by
// branch rather than through one representative row.

const importedInAugust = new Date('2026-08-03T08:00:00Z')
const flownInJuly = new Date('2026-07-14T09:00:00Z')

describe('the flight date: the earliest leg, falling back to the import instant', () => {
  it('takes the leg date, and not the instant the file was imported', () => {
    const row = flightReportRow(
      testFlightInput({
        flight: testFlight({ createdAt: importedInAugust }),
        firstLegStartedAt: flownInJuly,
      }),
    )

    // the case the derivation exists for: `created_at` is when the record arrived, and a
    // july flight imported in august must not report august
    expect(row.flight_date).toBe('2026-07-14')
    expect(row.flight_date_display).toBe('14.07.2026')
    expect(row.flight_date_sort).toBe(flownInJuly.getTime())
  })

  it('falls back to the import instant where no leg states a start', () => {
    // a manual entry has no leg at all, and a flight whose legs all carry a null start
    // reaches the same branch - the fallback keys on there being no earliest start
    const row = flightReportRow(
      testFlightInput({
        flight: testFlight({ createdAt: importedInAugust }),
        firstLegStartedAt: null,
      }),
    )

    expect(row.flight_date).toBe('2026-08-03')
    expect(row.flight_date_display).toBe('03.08.2026')
    expect(row.flight_date_sort).toBe(importedInAugust.getTime())
  })
})
