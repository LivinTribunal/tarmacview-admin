import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, membership, organization, person, trainingType } from '@/lib/db/schema'
import {
  withTenant,
  type TenantSession,
  type TenantTransaction,
} from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// who may DELETE, per table - docs/specs/03-data-model.md §"Delete authority in the
// rebuild". Postgres has no WITH CHECK for DELETE, so a superadmin-only `withCheck` beside
// a tenant-or-self `using` narrows inserts and updates and leaves deletion at `using`.
// every case below carries both halves: the refusal, and the same delete going through for
// whoever is allowed. without the second half a policy of `false` passes, which is a
// different bug.

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const superadminSession = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})
const alphaSession = (): TenantSession => ({
  personId: ids.people.alphaManager,
  systemRole: 'member',
})

// throwaway rows, built here rather than in tests/support/fixtures.ts: the seeded
// organisations carry `ON DELETE restrict` dependents, so a delete against one is refused
// by the foreign key whatever the policy says - which would pass for the wrong reason.
async function insertOne<T extends { id: number }>(inserted: Promise<T[]>): Promise<number> {
  const [row] = await inserted
  if (!row) throw new Error('test row was not inserted')
  return row.id
}

const newOrganization = (name: string) =>
  insertOne(
    harness.owner
      .insert(organization)
      .values({ name, reportToken: `report-token-${name.toLowerCase().replace(/\W+/g, '-')}` })
      .returning({ id: organization.id }),
  )

const newPerson = (name: string) =>
  insertOne(harness.owner.insert(person).values({ name, email: null }).returning({ id: person.id }))

const newMembership = (personId: number, organizationId: number) =>
  insertOne(
    harness.owner
      .insert(membership)
      .values({ personId, organizationId, role: 'accountable_manager' })
      .returning({ id: membership.id }),
  )

// the delete as the application role sees it: RLS filters the rows the statement matches,
// so a refused delete is an empty result rather than a throw
const deleteAs = (
  session: TenantSession,
  run: (tx: TenantTransaction) => Promise<{ id: number }[]>,
) => withTenant(harness.app, session, run)

describe('delete authority: the tenant tables a member must not delete', () => {
  it('refuses a member deleting its own organisation, and a superadmin still can', async () => {
    const organizationId = await newOrganization('Operator Delta')
    const managerId = await newPerson('Delta Manager')
    await newMembership(managerId, organizationId)
    const memberSession: TenantSession = { personId: managerId, systemRole: 'member' }

    const refused = await deleteAs(memberSession, (tx) =>
      tx.delete(organization).where(eq(organization.id, organizationId)).returning({
        id: organization.id,
      }),
    )
    expect(refused).toEqual([])

    // read back through the RLS-exempt owner connection: the member's own read is scoped,
    // so an empty read there would prove nothing about whether the row survived
    const survivors = await harness.owner
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
    expect(survivors).toHaveLength(1)

    const removed = await deleteAs(superadminSession(), (tx) =>
      tx.delete(organization).where(eq(organization.id, organizationId)).returning({
        id: organization.id,
      }),
    )
    expect(removed).toHaveLength(1)
  })

  it('refuses a member deleting their own person row, and a superadmin still can', async () => {
    const personId = await newPerson('Delete Candidate')
    const selfSession: TenantSession = { personId, systemRole: 'member' }

    const refused = await deleteAs(selfSession, (tx) =>
      tx.delete(person).where(eq(person.id, personId)).returning({ id: person.id }),
    )
    expect(refused).toEqual([])

    // the pilot register entry a flight history hangs off, so its survival is the claim
    const survivors = await harness.owner.select().from(person).where(eq(person.id, personId))
    expect(survivors).toHaveLength(1)

    const removed = await deleteAs(superadminSession(), (tx) =>
      tx.delete(person).where(eq(person.id, personId)).returning({ id: person.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('refuses a member deleting their own membership, and a superadmin still can', async () => {
    const organizationId = await newOrganization('Operator Echo')
    const personId = await newPerson('Echo Manager')
    const membershipId = await newMembership(personId, organizationId)
    const selfSession: TenantSession = { personId, systemRole: 'member' }

    const refused = await deleteAs(selfSession, (tx) =>
      tx.delete(membership).where(eq(membership.id, membershipId)).returning({ id: membership.id }),
    )
    expect(refused).toEqual([])

    const survivors = await harness.owner
      .select()
      .from(membership)
      .where(eq(membership.id, membershipId))
    expect(survivors).toHaveLength(1)

    // detach is not delete: only who may detach changes here, never whether the person
    // survives it
    const removed = await deleteAs(superadminSession(), (tx) =>
      tx.delete(membership).where(eq(membership.id, membershipId)).returning({ id: membership.id }),
    )
    expect(removed).toHaveLength(1)
    const detached = await harness.owner.select().from(person).where(eq(person.id, personId))
    expect(detached).toHaveLength(1)
  })
})

describe('delete authority: the tenant tables a member owns', () => {
  it('lets a member delete their own syllabus entry and not another tenant one', async () => {
    const own = await insertOne(
      harness.owner
        .insert(trainingType)
        .values({
          organizationId: ids.organizations.alpha,
          name: 'Alpha Withdrawn Training',
          code: 'WDR',
        })
        .returning({ id: trainingType.id }),
    )

    const removed = await deleteAs(alphaSession(), (tx) =>
      tx.delete(trainingType).where(eq(trainingType.id, own)).returning({ id: trainingType.id }),
    )
    expect(removed).toHaveLength(1)

    const foreign = ids.trainingTypes.bravoInitial
    const refused = await deleteAs(alphaSession(), (tx) =>
      tx.delete(trainingType).where(eq(trainingType.id, foreign)).returning({ id: trainingType.id }),
    )
    // a silent no-op rather than an error, the same not-found-rather-than-forbidden shape
    // the read tests carry
    expect(refused).toEqual([])

    const survivors = await harness.owner
      .select()
      .from(trainingType)
      .where(eq(trainingType.id, foreign))
    expect(survivors).toHaveLength(1)
  })

  it('lets a member delete their own airframe and not another tenant one', async () => {
    const own = await insertOne(
      harness.owner
        .insert(device)
        .values({ organizationId: ids.organizations.alpha, serialNumber: 'SN-ALPHA-0003' })
        .returning({ id: device.id }),
    )

    const removed = await deleteAs(alphaSession(), (tx) =>
      tx.delete(device).where(eq(device.id, own)).returning({ id: device.id }),
    )
    expect(removed).toHaveLength(1)

    const foreign = ids.airframes.bravoOne
    const refused = await deleteAs(alphaSession(), (tx) =>
      tx.delete(device).where(eq(device.id, foreign)).returning({ id: device.id }),
    )
    expect(refused).toEqual([])

    const survivors = await harness.owner.select().from(device).where(eq(device.id, foreign))
    expect(survivors).toHaveLength(1)
  })
})
