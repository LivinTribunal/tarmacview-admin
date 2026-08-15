import type { Database } from '@/lib/db/client'
import {
  device,
  deviceType,
  membership,
  organization,
  person,
  trainingType,
} from '@/lib/db/schema'

// every value here is invented. no pilot name, e-mail address, licence number, airframe
// serial or organisation token from the predecessor belongs in this repo, and a
// realistic-looking 32-hex report token trips the conventions gate by design.

const organizations = [
  { key: 'alpha', name: 'Operator Alpha', reportToken: 'report-token-alpha' },
  { key: 'bravo', name: 'Operator Bravo', reportToken: 'report-token-bravo' },

  // no airframes, no syllabus and nobody attached. the delete block is only a claim if
  // something also proves a delete still goes through when there is nothing to protect.
  { key: 'charlie', name: 'Operator Charlie', reportToken: 'report-token-charlie' },
] as const

const people = [
  { key: 'alphaManager', name: 'Alpha Manager', email: 'alpha.manager@example.invalid' },
  { key: 'bravoManager', name: 'Bravo Manager', email: 'bravo.manager@example.invalid' },

  // a pilot with no e-mail and no credentials. that is the normal case for the pilot
  // register, not an edge case, and a unique-not-null e-mail would make it impossible.
  { key: 'alphaPilot', name: 'Alpha Pilot', email: null },

  // the only cross-tenant reach there is. it comes from the system role and not from a
  // membership, so this one holds none.
  { key: 'systemAdmin', name: 'System Administrator', email: 'admin@example.invalid' },
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

export type OrganizationKey = (typeof organizations)[number]['key']
export type PersonKey = (typeof people)[number]['key']
export type AirframeKey = (typeof airframes)[number]['key']
export type TrainingTypeKey = (typeof trainingTypes)[number]['key']

export type SeededIds = {
  organizations: Record<OrganizationKey, number>
  people: Record<PersonKey, number>
  airframes: Record<AirframeKey, number>
  trainingTypes: Record<TrainingTypeKey, number>
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
        .values({ name: entry.name, reportToken: entry.reportToken })
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

  return {
    organizations: organizationIds,
    people: personIds,
    airframes: airframeIds,
    trainingTypes: trainingTypeIds,
    deviceType: deviceTypeId,
  }
}
