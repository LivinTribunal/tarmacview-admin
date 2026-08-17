import { and, asc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { membership, person } from '@/lib/db/schema'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the policy pair that lets a people register exist - docs/specs/03-data-model.md
// §"The shared-organisation read in the rebuild". two tables answer together here, so
// this file is named for the decision rather than for either of them: `person` admits
// the people you share an organisation with, `membership` admits the attachments to
// organisations you belong to, and neither is legible without the other.
//
// the FORCE ROW LEVEL SECURITY sweep over all five tenant tables and the detach-is-not-
// delete claim live in airframe-isolation.test.ts and are unchanged by this; what is
// re-asserted below is only what this migration's own DROP and CREATE could have broken.

let harness: TestDatabase
let ids: SeededIds

// a pilot flying for both operators. built here rather than in tests/support/fixtures.ts
// for the reason delete-authority.test.ts builds its own rows: a second person inside
// Operator Alpha changes what every other suite counts, and this case is this file's
// subject rather than a property of the fixture set.
let sharedPilot: number
let sharedPilotInBravo: number

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)

  const [pilot] = await harness.owner
    .insert(person)
    .values({ name: 'Shared Pilot', email: null })
    .returning({ id: person.id })
  if (!pilot) throw new Error('fixture row was not inserted')
  sharedPilot = pilot.id

  const attachments = await harness.owner
    .insert(membership)
    .values([
      { personId: pilot.id, organizationId: ids.organizations.alpha, role: 'pilot' },
      { personId: pilot.id, organizationId: ids.organizations.bravo, role: 'pilot' },
    ])
    .returning({ id: membership.id, organizationId: membership.organizationId })

  const inBravo = attachments.find((row) => row.organizationId === ids.organizations.bravo)
  if (!inBravo) throw new Error('fixture row was not inserted')
  sharedPilotInBravo = inBravo.id
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

// no where clause in either of these, and that is the point: the policies scope them, so
// another operator's staff is not hidden by a filter somebody could forget.
const peopleVisibleTo = (session: TenantSession) =>
  withTenant(harness.app, session, (tx) => tx.select().from(person).orderBy(asc(person.id)))

const membershipsVisibleTo = (session: TenantSession) =>
  withTenant(harness.app, session, (tx) => tx.select().from(membership).orderBy(asc(membership.id)))

// the case the whole policy is about, and the one a sees-more-than-before test passes
// while broken.
describe('the shared-organisation read: the person two operators share', () => {
  it('shows a member of alpha the shared pilot, and none of that pilot bravo attachment', async () => {
    const names = (await peopleVisibleTo(alphaSession())).map((row) => row.name)
    expect(names).toContain('Shared Pilot')

    const attachments = (await membershipsVisibleTo(alphaSession())).filter(
      (row) => row.personId === sharedPilot,
    )
    expect(attachments.map((row) => row.organizationId)).toEqual([ids.organizations.alpha])
  })

  it('names no organisation but alpha, in any membership row alpha can read at all', async () => {
    const attachments = await membershipsVisibleTo(alphaSession())

    // the previous test would still pass if the bravo row leaked under a different
    // person; this is the same claim over the whole table
    expect(attachments).not.toHaveLength(0)
    expect([...new Set(attachments.map((row) => row.organizationId))]).toEqual([
      ids.organizations.alpha,
    ])
  })

  it('states the organisation predicate in the person policy rather than inheriting it', async () => {
    // the one half of this pair no behavioural test can reach. membership's own policy
    // already ands the same condition onto the subquery, so dropping it from person's
    // changes nothing observable today - and everything on the day somebody narrows
    // membership's. asserted where it is written, since it cannot be asserted by reading.
    const [policy] = await harness.owner.execute(
      sql`select pg_get_expr(polqual, polrelid) as predicate from pg_policy
          where polname = 'person_shared_organization_or_self'`,
    )
    expect(policy?.predicate).toContain('organization_id')
  })

  it('reads both attachments to a superadmin, so the exclusion above is the policy and not an empty read', async () => {
    const attachments = (await membershipsVisibleTo(superadminSession())).filter(
      (row) => row.personId === sharedPilot,
    )
    expect(attachments.map((row) => row.organizationId).sort()).toEqual(
      [ids.organizations.alpha, ids.organizations.bravo].sort(),
    )
  })
})

describe('the shared-organisation read: the person register under a member session', () => {
  it('returns the people the acting person shares an organisation with', async () => {
    const names = (await peopleVisibleTo(alphaSession())).map((row) => row.name)

    // the acting person, the co-member they never see in the airframe register, and the
    // shared pilot. `Bravo Manager` belongs only to the other operator; `System
    // Administrator` belongs to no organisation at all.
    expect(names.sort()).toEqual([
      'Alpha Manager',
      'Alpha Pilot',
      'Alpha Second Pilot',
      'Shared Pilot',
    ])
  })

  it('a cross-tenant person id returns not-found rather than forbidden', async () => {
    const [found] = await withTenant(harness.app, alphaSession(), (tx) =>
      tx.select().from(person).where(eq(person.id, ids.people.bravoManager)).limit(1),
    )
    // undefined, not a throw and not a refusal: refusing would confirm the person exists
    expect(found).toBeUndefined()
  })

  it('the other operator sees its own people, which is the half that makes the first mean something', async () => {
    const names = (await peopleVisibleTo(bravoSession())).map((row) => row.name)
    expect(names.sort()).toEqual(['Bravo Manager', 'Bravo Pilot', 'Shared Pilot'])
  })

  it('a person attached to no organisation reaches nobody but themselves', async () => {
    // the seeded superadmin holds no membership, so under a member context the self
    // disjunct is the only one that admits anything. the two lists above are exhaustive
    // and neither names them, which is the other half of the claim.
    const names = (
      await peopleVisibleTo({ personId: ids.people.systemAdmin, systemRole: 'member' })
    ).map((row) => row.name)
    expect(names).toEqual(['System Administrator'])
  })

  it('a superadmin reaches every person, membership or none', async () => {
    const names = (await peopleVisibleTo(superadminSession())).map((row) => row.name)
    expect(names.sort()).toEqual([
      'Alpha Manager',
      'Alpha Pilot',
      'Alpha Second Pilot',
      'Bravo Manager',
      'Bravo Pilot',
      'Shared Pilot',
      'System Administrator',
    ])
  })
})

// the policy pair widens reading and nothing else. `withCheck` on both tables stays
// superadmin-only and both restrictive delete policies are untouched, so a member now
// sees rows they still may not touch - docs/specs/03-data-model.md §"Delete authority in
// the rebuild".
describe('the shared-organisation read: a member reads more and writes no more', () => {
  it('refuses a member creating a person', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(person).values({ name: 'Smuggled Person', email: null }),
      ),
    ).rejects.toThrow()

    const landed = await harness.owner
      .select()
      .from(person)
      .where(eq(person.name, 'Smuggled Person'))
    expect(landed).toEqual([])
  })

  it('refuses a member renaming a co-member they can now read', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.update(person).set({ name: 'Renamed Pilot' }).where(eq(person.id, ids.people.alphaPilot)),
      ),
    ).rejects.toThrow()

    // the row was readable, so this is the write half being refused rather than the read
    // half hiding it
    const [pilot] = await harness.owner
      .select()
      .from(person)
      .where(eq(person.id, ids.people.alphaPilot))
    expect(pilot?.name).toBe('Alpha Pilot')
  })

  it('refuses a member attaching somebody to their own organisation', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(membership).values({
          personId: ids.people.bravoManager,
          organizationId: ids.organizations.alpha,
          role: 'viewer',
        }),
      ),
    ).rejects.toThrow()

    const landed = await harness.owner
      .select()
      .from(membership)
      .where(eq(membership.personId, ids.people.bravoManager))
    expect(landed.map((row) => row.organizationId)).toEqual([ids.organizations.bravo])
  })

  it('refuses a member deleting a co-member, and their attachment, now that both are readable', async () => {
    const refused = await withTenant(harness.app, alphaSession(), async (tx) => ({
      people: await tx
        .delete(person)
        .where(eq(person.id, ids.people.alphaPilot))
        .returning({ id: person.id }),
      attachments: await tx
        .delete(membership)
        .where(eq(membership.personId, ids.people.alphaPilot))
        .returning({ id: membership.id }),
    }))

    // a restrictive delete policy filters the rows the statement matches, so the refusal
    // is an empty result rather than a throw
    expect(refused).toEqual({ people: [], attachments: [] })

    const survivors = await harness.owner
      .select()
      .from(person)
      .where(eq(person.id, ids.people.alphaPilot))
    expect(survivors).toHaveLength(1)
  })
})

// the escape the two policies above are written against. it bypasses row-level security,
// so what it may be trusted with is the whole of its safety - drizzle/0005_shared_organization_policy.sql.
describe('the helper the policies ask their question through', () => {
  const helper = () =>
    harness.owner.execute(
      sql`select prosecdef, provolatile, proconfig, prosrc,
                 (select rolsuper or rolbypassrls from pg_roles where oid = proowner) as owner_escapes_rls
          from pg_proc where proname = 'app_acting_organizations'`,
    )

  it('is a stable security-definer function with its search_path pinned', async () => {
    const [row] = await helper()
    expect(row).toMatchObject({
      prosecdef: true,
      provolatile: 's',
      proconfig: ['search_path=""'],
    })
  })

  it('is owned by a role row-level security does not apply to, or it escapes nothing', async () => {
    // FORCE ROW LEVEL SECURITY reaches the table owner too, so a definer function owned by
    // one would read `membership` under the very policy it exists to answer without.
    const [row] = await helper()
    expect(row).toMatchObject({ owner_escapes_rls: true })
  })

  it('answers one question and never reads the system role', async () => {
    const [row] = await helper()
    // superadmin lives in the policies. a helper that decided it too would have a second
    // reason to be trusted, and this one is trusted enough already.
    expect(row?.prosrc).not.toContain('system_role')
    expect(row?.prosrc).toContain('organization_id')
  })

  it('may be executed by the application role and by nobody else', async () => {
    const [row] = await harness.owner.execute(
      // grantee 0 is PUBLIC, which is who EXECUTE is granted to by default
      sql`select has_function_privilege('tarmacview_app', 'app_acting_organizations()', 'execute') as app_may_execute,
                 exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                         where p.proname = 'app_acting_organizations'
                           and a.privilege_type = 'EXECUTE' and a.grantee = 0) as public_may_execute`,
    )
    expect(row).toMatchObject({ app_may_execute: true, public_may_execute: false })
  })
})

// last, because it is the only test here that changes what the others read
describe('the shared-organisation read: what the rewritten policies did not disturb', () => {
  it('still forces row-level security on both tables the migration dropped a policy from', async () => {
    const rows = await harness.owner.execute(
      sql`select relname, relrowsecurity, relforcerowsecurity from pg_class
          where relname in ('person', 'membership') order by relname`,
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row, `${row.relname} is not fully protected`).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      })
    }
  })

  it('detaching the shared pilot from bravo leaves the person, and leaves alpha reading them', async () => {
    await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(membership).where(eq(membership.id, sharedPilotInBravo)),
    )

    const survivors = await harness.owner.select().from(person).where(eq(person.id, sharedPilot))
    expect(survivors).toHaveLength(1)

    // detach is not delete, and it is not a deletion from the other operator either: the
    // alpha attachment is what alpha reads them through, and it is untouched
    expect((await peopleVisibleTo(alphaSession())).map((row) => row.name)).toContain('Shared Pilot')
    expect((await peopleVisibleTo(bravoSession())).map((row) => row.name)).not.toContain(
      'Shared Pilot',
    )

    const remaining = await harness.owner
      .select()
      .from(membership)
      .where(
        and(
          eq(membership.personId, sharedPilot),
          eq(membership.organizationId, ids.organizations.alpha),
        ),
      )
    expect(remaining).toHaveLength(1)
  })
})
