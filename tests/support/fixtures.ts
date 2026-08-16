import { fileURLToPath } from 'node:url'
import type { Database } from '@/lib/db/client'
import {
  device,
  deviceType,
  flight,
  flightLog,
  membership,
  organization,
  person,
  training,
  trainingDevice,
  trainingType,
} from '@/lib/db/schema'

// every value here is invented. no pilot name, e-mail address, licence number, airframe
// serial or organisation token from the predecessor belongs in this repo, and a
// realistic-looking 32-hex report token trips the conventions gate by design. the logo
// under storage/ is an invented placeholder square, drawn here rather than fetched.

// the disk half of the fixtures. a test that serves a file points FILE_STORAGE_ROOT at
// this directory, so the storage root stays configuration in tests too - nothing reads a
// literal path out of the application.
export const FIXTURE_STORAGE_ROOT = fileURLToPath(new URL('./storage', import.meta.url))

// only alpha names a file. bravo and charlie keep a null `logo_path`, which is the normal
// case for the column and the one that must not become a crash.
const organizations = [
  {
    key: 'alpha',
    name: 'Operator Alpha',
    reportToken: 'report-token-alpha',
    logoPath: 'organization-logos/alpha.png',
  },
  { key: 'bravo', name: 'Operator Bravo', reportToken: 'report-token-bravo', logoPath: null },

  // no airframes, no syllabus and nobody attached. the delete block is only a claim if
  // something also proves a delete still goes through when there is nothing to protect.
  {
    key: 'charlie',
    name: 'Operator Charlie',
    reportToken: 'report-token-charlie',
    logoPath: null,
  },
] as const

// the certificate values are deliberately silly. a plausible-looking number survives
// review; `CERT-PLACEHOLDER-…` cannot be mistaken for a real pilot's.
const people = [
  {
    key: 'alphaManager',
    name: 'Alpha Manager',
    email: 'alpha.manager@example.invalid',
    certificate: null,
  },
  {
    key: 'bravoManager',
    name: 'Bravo Manager',
    email: 'bravo.manager@example.invalid',
    certificate: null,
  },

  // a pilot with no e-mail and no credentials. that is the normal case for the pilot
  // register, not an edge case, and a unique-not-null e-mail would make it impossible.
  // the one fixture holding certificates, so the register has something to print and the
  // three rows above keep proving the blank marker.
  {
    key: 'alphaPilot',
    name: 'Alpha Pilot',
    email: null,
    certificate: {
      number: 'CERT-PLACEHOLDER-0001',
      types: ['A1_A3', 'A2'],
      validUntil: '2027-06-30',
    },
  },

  // the only cross-tenant reach there is. it comes from the system role and not from a
  // membership, so this one holds none.
  {
    key: 'systemAdmin',
    name: 'System Administrator',
    email: 'admin@example.invalid',
    certificate: null,
  },
] as const

const airframes = [
  { key: 'alphaOne', organization: 'alpha', serialNumber: 'SN-ALPHA-0001', typed: true },
  // no device type: no VLOS limit and no service interval, which must read as a gap
  { key: 'alphaTwo', organization: 'alpha', serialNumber: 'SN-ALPHA-0002', typed: false },
  { key: 'bravoOne', organization: 'bravo', serialNumber: 'SN-BRAVO-0001', typed: true },
] as const

const trainingTypes = [
  { key: 'alphaInitial', organization: 'alpha', name: 'Alpha Initial Training', code: 'A1' },
  {
    key: 'alphaOperational',
    organization: 'alpha',
    name: 'Alpha Operational Training',
    code: 'OPS',
  },

  // the same code under the other operator. `code` is unique per organisation, never
  // deployment-wide, so this row is the fixture that pins that decision.
  { key: 'bravoInitial', organization: 'bravo', name: 'Bravo Initial Training', code: 'A1' },
] as const

// alpha and bravo only, never charlie: tests/tenancy/organization-isolation.test.ts deletes
// charlie to prove the dependent block lifts, and `training.organization_id` is `restrict`,
// so a training under charlie would turn that proof into a failure.
const trainings = [
  {
    key: 'alphaRecurrent',
    organization: 'alpha',
    name: 'Alpha Recurrent Training',
    trainingType: 'alphaInitial',
    pilot: 'alphaPilot',
    heldOn: '2026-03-01',
    validUntil: '2027-03-01',
    airframes: ['alphaOne'],
  },

  // no type, no date, no expiry and no airframe. the row that keeps the register honest
  // about the difference between a gap and a stated fact: a null `valid_until` reads as
  // *Bez expirácie*, a null `training_type_id` as the blank marker.
  {
    key: 'alphaOpen',
    organization: 'alpha',
    name: 'Alpha Unclassified Training',
    trainingType: null,
    pilot: 'alphaPilot',
    heldOn: null,
    validUntil: null,
    airframes: [],
  },
  {
    key: 'bravoRecurrent',
    organization: 'bravo',
    name: 'Bravo Recurrent Training',
    trainingType: 'bravoInitial',
    pilot: 'bravoManager',
    heldOn: '2026-04-01',
    validUntil: '2027-04-01',
    airframes: ['bravoOne'],
  },
] as const

// alpha and bravo only, for the reason the trainings above are: charlie is deleted to prove
// the dependent block lifts, and `flight.organization_id` is `restrict`.
//
// none of these names an airframe a training already covers. an airframe carrying both
// would leave two `restrict` constraints able to refuse the same delete, and the test that
// names which one refused would then be asserting an ordering Postgres never promised.
//
// every value is invented, filenames included: a real log name carries a controller serial
// and a date, and neither belongs in this repo.
const flights = [
  {
    key: 'alphaImported',
    organization: 'alpha',
    fileName: 'placeholder-flight-0001.txt',
    entryMode: 'dji_log',
    pilot: 'alphaPilot',
    airframe: 'alphaTwo',
    importedBy: 'alphaManager',
    parsingStatus: 'processed',
    parsingErrors: null,
    totalFlightTimeSeconds: 5100,
    maxAltitudeMeters: '95.5',
    maxDistanceMeters: '420.25',
    totalDistanceMeters: '1830.75',
    legs: 2,
  },

  // no pilot, no airframe and nobody named as the importer. that is the normal state of a
  // synced flight - automated ingest cannot know who was flying - and it is the row the
  // register most has to keep visible.
  {
    key: 'alphaUnassigned',
    organization: 'alpha',
    fileName: 'placeholder-flight-0002.txt',
    entryMode: 'controller_sync',
    pilot: null,
    airframe: null,
    importedBy: null,
    parsingStatus: 'processed',
    parsingErrors: null,
    totalFlightTimeSeconds: 2400,
    maxAltitudeMeters: '48',
    maxDistanceMeters: '110',
    totalDistanceMeters: '640',
    legs: 1,
  },

  // the parse failed, so there are no legs and no measurements - and the row is retained,
  // because it is still evidence that a flight happened
  {
    key: 'alphaFailed',
    organization: 'alpha',
    fileName: 'placeholder-flight-0003.txt',
    entryMode: 'dji_log',
    pilot: null,
    airframe: null,
    importedBy: 'alphaManager',
    parsingStatus: 'failed',
    parsingErrors: 'Placeholder parse failure.',
    totalFlightTimeSeconds: null,
    maxAltitudeMeters: null,
    maxDistanceMeters: null,
    totalDistanceMeters: null,
    legs: 0,
  },

  // manually entered, so nothing was parsed and the status is null rather than a state
  // invented to fill it
  {
    key: 'bravoManual',
    organization: 'bravo',
    fileName: 'placeholder-flight-0004',
    entryMode: 'manual',
    pilot: 'bravoManager',
    airframe: 'bravoOne',
    importedBy: 'bravoManager',
    parsingStatus: null,
    parsingErrors: null,
    totalFlightTimeSeconds: 2700,
    maxAltitudeMeters: '60',
    maxDistanceMeters: '250',
    totalDistanceMeters: '900',
    legs: 0,
  },
] as const

export type OrganizationKey = (typeof organizations)[number]['key']
export type PersonKey = (typeof people)[number]['key']
export type AirframeKey = (typeof airframes)[number]['key']
export type TrainingTypeKey = (typeof trainingTypes)[number]['key']
export type TrainingKey = (typeof trainings)[number]['key']
export type FlightKey = (typeof flights)[number]['key']

export type SeededIds = {
  organizations: Record<OrganizationKey, number>
  people: Record<PersonKey, number>
  airframes: Record<AirframeKey, number>
  trainingTypes: Record<TrainingTypeKey, number>
  trainings: Record<TrainingKey, number>
  flights: Record<FlightKey, number>
  deviceType: number
}

async function insertOne<T extends { id: number }>(inserted: Promise<T[]>): Promise<number> {
  const [row] = await inserted
  if (!row) throw new Error('fixture row was not inserted')
  return row.id
}

// seeded through a connection that is exempt from row-level security, because the
// policies deny a write from a session with no tenant context - which is the correct
// behaviour, and makes seeding a deployment concern rather than an application one.
export async function seedFixtures(db: Database): Promise<SeededIds> {
  const organizationIds = {} as Record<OrganizationKey, number>
  for (const entry of organizations) {
    organizationIds[entry.key] = await insertOne(
      db
        .insert(organization)
        .values({ name: entry.name, reportToken: entry.reportToken, logoPath: entry.logoPath })
        .returning({ id: organization.id }),
    )
  }

  const personIds = {} as Record<PersonKey, number>
  for (const entry of people) {
    personIds[entry.key] = await insertOne(
      db
        .insert(person)
        .values({
          name: entry.name,
          email: entry.email,
          systemRole: entry.key === 'systemAdmin' ? 'superadmin' : 'member',
          certificateNumber: entry.certificate?.number ?? null,
          certificateTypes: entry.certificate ? [...entry.certificate.types] : [],
          certificateValidUntil: entry.certificate?.validUntil ?? null,
        })
        .returning({ id: person.id }),
    )
  }

  await db.insert(membership).values([
    {
      personId: personIds.alphaManager,
      organizationId: organizationIds.alpha,
      role: 'accountable_manager',
      isPrimaryContact: true,
    },
    { personId: personIds.alphaPilot, organizationId: organizationIds.alpha, role: 'pilot' },
    {
      personId: personIds.bravoManager,
      organizationId: organizationIds.bravo,
      role: 'accountable_manager',
      isPrimaryContact: true,
    },
  ])

  const deviceTypeId = await insertOne(
    db
      .insert(deviceType)
      .values({
        name: 'Placeholder Quadcopter',
        maxVlos: '500',
        serviceInterval: 50,
        serviceIntervalMonths: 12,
        batteryServiceInterval: 100,
        maintenanceInstructions: 'Placeholder maintenance instructions.',
      })
      .returning({ id: deviceType.id }),
  )

  const airframeIds = {} as Record<AirframeKey, number>
  for (const entry of airframes) {
    airframeIds[entry.key] = await insertOne(
      db
        .insert(device)
        .values({
          organizationId: organizationIds[entry.organization],
          serialNumber: entry.serialNumber,
          deviceTypeId: entry.typed ? deviceTypeId : null,
        })
        .returning({ id: device.id }),
    )
  }

  const trainingTypeIds = {} as Record<TrainingTypeKey, number>
  for (const entry of trainingTypes) {
    trainingTypeIds[entry.key] = await insertOne(
      db
        .insert(trainingType)
        .values({
          organizationId: organizationIds[entry.organization],
          name: entry.name,
          code: entry.code,
        })
        .returning({ id: trainingType.id }),
    )
  }

  const trainingIds = {} as Record<TrainingKey, number>
  for (const entry of trainings) {
    const organizationId = organizationIds[entry.organization]
    trainingIds[entry.key] = await insertOne(
      db
        .insert(training)
        .values({
          organizationId,
          name: entry.name,
          trainingTypeId: entry.trainingType ? trainingTypeIds[entry.trainingType] : null,
          pilotId: personIds[entry.pilot],
          heldOn: entry.heldOn,
          validUntil: entry.validUntil,
        })
        .returning({ id: training.id }),
    )

    // the pivot carries the tenant itself rather than reaching the training for it, so the
    // seed states it here too - and the composite foreign key is what stops it drifting
    for (const airframe of entry.airframes) {
      await db.insert(trainingDevice).values({
        trainingId: trainingIds[entry.key],
        deviceId: airframeIds[airframe],
        organizationId,
      })
    }
  }

  const flightIds = {} as Record<FlightKey, number>
  for (const entry of flights) {
    const organizationId = organizationIds[entry.organization]
    flightIds[entry.key] = await insertOne(
      db
        .insert(flight)
        .values({
          organizationId,
          fileName: entry.fileName,
          entryMode: entry.entryMode,
          pilotId: entry.pilot ? personIds[entry.pilot] : null,
          deviceId: entry.airframe ? airframeIds[entry.airframe] : null,
          importedBy: entry.importedBy ? personIds[entry.importedBy] : null,
          parsingStatus: entry.parsingStatus,
          parsingErrors: entry.parsingErrors,
          totalFlightTimeSeconds: entry.totalFlightTimeSeconds,
          maxAltitudeMeters: entry.maxAltitudeMeters,
          maxDistanceMeters: entry.maxDistanceMeters,
          totalDistanceMeters: entry.totalDistanceMeters,
        })
        .returning({ id: flight.id }),
    )

    // the legs carry the tenant themselves rather than reaching the flight for it, the way
    // the training pivot does - and the composite foreign key is what stops it drifting
    for (let leg = 0; leg < entry.legs; leg += 1) {
      await db.insert(flightLog).values({
        flightId: flightIds[entry.key],
        organizationId,
        durationSeconds: 600,
        distanceMeters: '300',
        maxAltitudeMeters: '45',
        aircraft: 'Placeholder Quadcopter',
      })
    }
  }

  return {
    organizations: organizationIds,
    people: personIds,
    airframes: airframeIds,
    trainingTypes: trainingTypeIds,
    trainings: trainingIds,
    flights: flightIds,
    deviceType: deviceTypeId,
  }
}
