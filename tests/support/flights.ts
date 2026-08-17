import type { Flight } from '@/lib/db/schema'
import type { FlightReportInput } from '@/lib/report/flight-row'

// plain objects for the pure suites, beside airframes.ts - no database, no fixtures,
// invented values only.

const importedAt = new Date('2026-08-03T08:00:00Z')

export function testFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: 1,
    organizationId: 1,
    deviceId: 1,
    pilotId: 1,
    importedBy: 1,
    fileName: 'placeholder-flight-0001.txt',
    entryMode: 'dji_log',
    totalFlightTimeSeconds: 5100,
    maxAltitudeMeters: '95.5',
    maxDistanceMeters: '420.25',
    totalDistanceMeters: '1830.75',
    parsingStatus: 'processed',
    parsingErrors: null,
    createdAt: importedAt,
    ...overrides,
  }
}

// an assigned flight of a typed airframe, which is the row every gap below is a departure
// from. `maxVlos` matches the device-type fixture in airframes.ts.
export function testFlightInput(overrides: Partial<FlightReportInput> = {}): FlightReportInput {
  return {
    flight: testFlight(),
    pilotName: 'Alpha Pilot',
    airframe: { serialNumber: 'SN-ALPHA-0001', model: 'Placeholder Model' },
    deviceType: { maxVlos: '500' },
    firstLegStartedAt: new Date('2026-07-14T09:00:00Z'),
    ...overrides,
  }
}
