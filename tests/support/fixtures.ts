import type { Database } from '@/lib/db/client'
import { device, deviceType, membership, organization, person } from '@/lib/db/schema'

// every value here is invented. no pilot name, e-mail address, licence number, airframe
// serial or organisation token from the predecessor belongs in this repo, and a
// realistic-looking 32-hex report token trips the conventions gate by design.

const organizations = [
  { key: 'alpha', name: 'Operator Alpha', reportToken: 'report-token-alpha' },
  { key: 'bravo', name: 'Operator Bravo', reportToken: 'report-token-bravo' },
] as const

const people = [
  { key: 'alphaManager', name: 'Alpha Manager', email: 'alpha.manager@example.invalid' },
  { key: 'bravoManager', name: 'Bravo Manager', email: 'bravo.manager@example.invalid' },

  // a pilot with no e-mail and no credentials. that is the normal case for the pilot
  // register, not an edge case, and a unique-not-null e-mail would make it impossible.
  { key: 'alphaPilot', name: 'Alpha Pilot', email: null },

  { key: 'systemAdmin', name: 'System Administrator', email: 'admin@example.invalid' },
] as const

export type OrganizationKey = (typeof organizations)[number]['key']
export type PersonKey = (typeof people)[number]['key']
export type AirframeKey = 'alphaOne' | 'alphaTwo' | 'bravoOne'

export type SeededIds = {
  organizations: Record<OrganizationKey, number>
  people: Record<PersonKey, number>
  airframes: Record<AirframeKey, number>
  deviceType: number
}

// seeded through a connection that is exempt from row-level security, because policies
// deny writes to a session with no tenant context - which is the correct behaviour, and
// makes seeding a deployment concern rather than an application one.
export async function seedFixtures(db: Database): Promise<SeededIds> {
  const insertedOrganizations = await db
    .insert(organization)
    .values(organizations.map(({ name, reportToken }) => ({ name, reportToken })))
    .returning({ id: organization.id, name: organization.name })

  const organizationId = (key: OrganizationKey): number => {
    const wanted = organizations.find((entry) => entry.key === key)
    const row = insertedOrganizations.find((candidate) => candidate.name === wanted?.name)
    if (!row) throw new Error(`fixture organisation ${key} was not inserted`)
    return row.id
  }

  const insertedPeople = await db
    .insert(person)
    .values(
      people.map(({ name, email, key }) => ({
        name,
        email,
        systemRole: key === 'systemAdmin' ? ('superadmin' as const) : ('member' as const),
      })),
    )
    .returning({ id: person.id, name: person.name })

  const personId = (key: PersonKey): number => {
    const wanted = people.find((entry) => entry.key === key)
    const row = insertedPeople.find((candidate) => candidate.name === wanted?.name)
    if (!row) throw new Error(`fixture person ${key} was not inserted`)
    return row.id
  }

  // the superadmin holds no membership: cross-tenant reach is the system role, never a
  // membership somewhere
  await db.insert(membership).values([
    {
      personId: personId('alphaManager'),
      organizationId: organizationId('alpha'),
      role: 'accountable_manager',
      isPrimaryContact: true,
    },
    {
      personId: personId('alphaPilot'),
      organizationId: organizationId('alpha'),
      role: 'pilot',
    },
    {
      personId: personId('bravoManager'),
      organizationId: organizationId('bravo'),
      role: 'accountable_manager',
      isPrimaryContact: true,
    },
  ])

  const [type] = await db
    .insert(deviceType)
    .values({
      name: 'Placeholder Quadcopter',
      maxVlos: '500',
      serviceInterval: 50,
      serviceIntervalMonths: 12,
      batteryServiceInterval: 100,
      maintenanceInstructions: 'Placeholder maintenance instructions.',
    })
    .returning({ id: deviceType.id })
  if (!type) throw new Error('fixture device type was not inserted')

  const insertedAirframes = await db
    .insert(device)
    .values([
      {
        organizationId: organizationId('alpha'),
        serialNumber: 'SN-ALPHA-0001',
        name: 'Alpha One',
        deviceTypeId: type.id,
      },
      // no device type: no VLOS limit and no service interval, which must read as a gap
      {
        organizationId: organizationId('alpha'),
        serialNumber: 'SN-ALPHA-0002',
        name: 'Alpha Two',
      },
      {
        organizationId: organizationId('bravo'),
        serialNumber: 'SN-BRAVO-0001',
        name: 'Bravo One',
        deviceTypeId: type.id,
      },
    ])
    .returning({ id: device.id, serialNumber: device.serialNumber })

  const airframeId = (serialNumber: string): number => {
    const row = insertedAirframes.find((candidate) => candidate.serialNumber === serialNumber)
    if (!row) throw new Error(`fixture airframe ${serialNumber} was not inserted`)
    return row.id
  }

  return {
    organizations: { alpha: organizationId('alpha'), bravo: organizationId('bravo') },
    people: {
      alphaManager: personId('alphaManager'),
      alphaPilot: personId('alphaPilot'),
      bravoManager: personId('bravoManager'),
      systemAdmin: personId('systemAdmin'),
    },
    airframes: {
      alphaOne: airframeId('SN-ALPHA-0001'),
      alphaTwo: airframeId('SN-ALPHA-0002'),
      bravoOne: airframeId('SN-BRAVO-0001'),
    },
    deviceType: type.id,
  }
}
