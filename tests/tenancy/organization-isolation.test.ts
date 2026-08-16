import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, membership, organization, person, trainingType } from '@/lib/db/schema'
import { findOrganization, listOrganizations } from '@/lib/tenant/scoped-organizations'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// `organization` is the table the whole tenancy model keys off, so this file carries two
// claims about it: that a member reaches only the organisations they hold a membership
// of, and that deleting one cannot take airworthiness evidence with it -
// docs/specs/03-data-model.md §"Organisation deletion and the logo in the rebuild".
// both fail if the policy or the foreign-key actions are changed underneath them.

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const alphaSession = (): TenantSession => ({
  personId: ids.people.alphaManager,
  systemRole: 'member',
})
const bravoSession = (): TenantSession => ({
  personId: ids.people.bravoManager,
  systemRole: 'member',
})
const superadminSession = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

const list = (session: TenantSession) =>
  withTenant(harness.app, session, (tx) => listOrganizations(tx, session))

describe('tenant isolation: the organisation register under a member session', () => {
  it('an unscoped read returns only the organisations the acting person belongs to', async () => {
    const rows = await list(alphaSession())
    expect(rows.map((row) => row.name)).toEqual(['Operator Alpha'])
  })

  it('the other tenant sees its own, which is the half that makes the first mean something', async () => {
    const rows = await list(bravoSession())
    expect(rows.map((row) => row.name)).toEqual(['Operator Bravo'])
  })

  it('a superadmin reaches all of them, so the two exclusions above are the policy and not an empty read', async () => {
    const rows = await list(superadminSession())
    expect(rows.map((row) => row.name)).toEqual([
      'Operator Alpha',
      'Operator Bravo',
      'Operator Charlie',
    ])
  })

  it('finds the acting tenant by id', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findOrganization(tx, ids.organizations.alpha),
    )
    expect(found?.name).toBe('Operator Alpha')
  })

  it('a cross-tenant id returns not-found rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findOrganization(tx, ids.organizations.bravo),
    )
    // null, not a throw and not a refusal: refusing would confirm the row exists
    expect(found).toBeNull()
  })

  it('still forces row-level security after the column was added', async () => {
    const [table] = await harness.owner.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'organization'`,
    )
    // an ALTER TABLE that quietly dropped FORCE would leave every policy in place and
    // exempt the owner from all of them
    expect(table).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true })
  })
})

describe('tenant isolation: the two counts beside each organisation', () => {
  it('counts the acting tenant own fleet, scoped by the airframe policy', async () => {
    const [alpha] = await list(alphaSession())
    expect(alpha?.airframeCount).toBe(2)
  })

  it('leaves the people count blank for a member, rather than reporting their own row as a roster', async () => {
    // `membership_own_or_superadmin` selects the acting person's own rows, so a count
    // here would read 1 for an organisation of any size. that is a gap, and it is shown
    // as one - src/lib/tenant/scoped-organizations.ts
    const [alpha] = await list(alphaSession())
    expect(alpha?.peopleCount).toBeNull()
  })

  it('counts people for a superadmin, whose session can actually see them all', async () => {
    const rows = await list(superadminSession())
    // alpha holds a manager and a pilot; the blank above is the policy, not a null column
    expect(rows.find((row) => row.name === 'Operator Alpha')?.peopleCount).toBe(2)
  })
})

// ordered: each of these leaves the tenant it touches in the state the next one expects,
// and the last one removes the dependent-free fixture organisation for good.
describe('what the organisation schema itself decides: deleting a tenant', () => {
  const deleteOrganization = (id: number) =>
    withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(organization).where(eq(organization.id, id)),
    )

  it('refuses to delete an organisation that owns an airframe', async () => {
    await expect(deleteOrganization(ids.organizations.alpha)).rejects.toThrow()

    // and the refusal was whole: a block that deletes half the dependents first is worse
    // than no block, because the evidence is gone either way
    const airframes = await harness.owner
      .select()
      .from(device)
      .where(eq(device.organizationId, ids.organizations.alpha))
    expect(airframes).toHaveLength(2)
  })

  it('refuses to delete an organisation that owns a training type', async () => {
    await harness.owner.insert(trainingType).values({
      organizationId: ids.organizations.charlie,
      name: 'Charlie Initial Training',
      code: 'A1',
    })

    await expect(deleteOrganization(ids.organizations.charlie)).rejects.toThrow()

    // put the tenant back the way the fixture had it, so the delete below proves the
    // block lifts rather than that this row happened to be gone
    await harness.owner
      .delete(trainingType)
      .where(eq(trainingType.organizationId, ids.organizations.charlie))
  })

  it('deletes an organisation with no dependents, detaching its people and deleting none of them', async () => {
    const [contact] = await harness.owner
      .insert(person)
      .values({ name: 'Charlie Contact', email: null })
      .returning({ id: person.id })
    if (!contact) throw new Error('fixture row was not inserted')

    await harness.owner.insert(membership).values({
      personId: contact.id,
      organizationId: ids.organizations.charlie,
      role: 'accountable_manager',
      isPrimaryContact: true,
    })

    // a membership is not airworthiness evidence, so it cascades where an airframe blocks
    await deleteOrganization(ids.organizations.charlie)

    const attachments = await harness.owner
      .select()
      .from(membership)
      .where(eq(membership.organizationId, ids.organizations.charlie))
    expect(attachments).toEqual([])

    // detach is not delete: dissolving the organisation leaves the person standing
    const survivors = await harness.owner.select().from(person).where(eq(person.id, contact.id))
    expect(survivors).toHaveLength(1)
  })
})
