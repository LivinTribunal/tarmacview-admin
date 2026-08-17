import type { Person } from '@/lib/db/schema'
import { flightReportRow } from '@/lib/report/flight-row'
import {
  expiryWindow,
  type ExpiryWindow,
  type PilotFlightInput,
  type PilotTrainingInput,
} from '@/lib/report/pilot-row'
import { testFlight, testFlightInput } from './flights'

// plain objects for the pure suites, beside airframes.ts and flights.ts - no database, no
// fixtures, invented values only. this file's real subject matter is pilots' names, e-mail
// addresses and certificate numbers, so every value here is deliberately unmistakable.

// the reporting day, stated rather than read from a clock: "inside the warning window" is
// only testable against a fixed instant, the reasoning ServiceReadings.asOf already records
export const REPORT_DAY = new Date('2026-08-15T00:00:00Z')

// the default is the schema's own default. a suite asserting that the window comes from the
// organisation passes something else.
export const testWindow = (warningDays = 40): ExpiryWindow => expiryWindow(REPORT_DAY, warningDays)

// no e-mail, no certificate and no contact details: the shape of a pilot who exists as the
// subject of flight records and nothing more, which is the normal case for the register
export function testPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 1,
    name: 'Placeholder Pilot',
    email: 'placeholder.pilot@example.invalid',
    systemRole: 'member',
    certificateNumber: null,
    certificateTypes: [],
    certificateValidUntil: null,
    phoneNumber: null,
    position: null,
    createdAt: REPORT_DAY,
    ...overrides,
  }
}

// a classified training that expires, which is the row every gap below is a departure from
export function pilotTraining(overrides: Partial<PilotTrainingInput> = {}): PilotTrainingInput {
  return {
    name: 'Placeholder Recurrent Training',
    trainingTypeName: 'Placeholder Initial Training',
    heldOn: '2026-03-01',
    validUntil: '2027-03-01',
    airframes: null,
    ...overrides,
  }
}

export type PilotFlightOptions = {
  id?: number
  // null is a flight naming no airframe, which groups under none and still lists
  deviceId?: number | null
  serialNumber?: string
  seconds?: number | null
}

// built through the real flight serialiser rather than hand-written, because the point of
// the nested arrays is that they are picked from the rows data.flights[] already carries
export function pilotFlight(options: PilotFlightOptions = {}): PilotFlightInput {
  const { id = 1, deviceId = 1, serialNumber = 'SN-PLACEHOLDER-0001', seconds = 5100 } = options

  return {
    seconds,
    row: flightReportRow(
      testFlightInput({
        flight: testFlight({ id, deviceId, totalFlightTimeSeconds: seconds }),
        airframe: deviceId === null ? null : { serialNumber, model: 'Placeholder Model' },
      }),
    ),
  }
}
