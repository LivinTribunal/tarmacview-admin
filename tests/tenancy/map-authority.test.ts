import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { map, mapKmlFile, mapOrganization, organization } from '@/lib/db/schema'
import { listMaps } from '@/lib/maps/register'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the geozone maps - docs/specs/03-data-model.md §"Maps in the rebuild". three tables and
// two different answers: `map` and `map_kml_file` belong to no operator and take the
// catalogue's write authority, `map_organization` carries an organisation and so is
// tenant-scoped on its read.
//
// nothing in the rebuild writes a map - the only write path is authentication - so the
// refusals below drive the database directly under a session, the way
// tests/tenancy/catalogue-write-authority.test.ts does. each is named for what breaks it,
// because none of the pieces is visible from a read.

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

// drizzle wraps the driver error, so the half worth asserting on is on `cause`. shaped like
// the copy in catalogue-write-authority, and only `message` is read: what refuses a write to
// these tables is a policy, and no constraint is involved.
type Refusal = { message?: string }

async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run()
  } catch (error) {
    return ((error as { cause?: Refusal }).cause ?? {}) as Refusal
  }
  throw new Error('the statement was not refused')
}

describe('the maps every session reads', () => {
  it('lists every map to a member, including one assigned to no organisation at all', async () => {
    const entries = await withTenant(harness.app, alphaSession(), listMaps)
    expect(entries.map((entry) => entry.slug)).toEqual([
      'placeholder-geozones',
      'placeholder-empty-map',
    ])
  })

  it('lists the same maps to the other operator, which is what makes a map deployment-wide', async () => {
    // the assignment controls which tenants see a map in their report, never who may read
    // it - docs/specs/08-maps.md. bravo reading a map assigned to nobody is that, asserted.
    const entries = await withTenant(harness.app, bravoSession(), listMaps)
    expect(entries.map((entry) => entry.id)).toEqual([ids.maps.shared, ids.maps.unassigned])
  })

  it('counts the layers, and a map with none counts none rather than reading blank', async () => {
    const entries = await withTenant(harness.app, alphaSession(), listMaps)
    expect(entries.map((entry) => entry.layerCount)).toEqual([2, 0])
  })

  it('reads nothing at all from a connection with no tenant context', async () => {
    // all three tables, because the deployment-wide read asks for a resolved acting person
    // rather than saying `true`: every session reads the maps, and a connection that is
    // nobody is not a session.
    expect(await harness.app.select().from(map)).toEqual([])
    expect(await harness.app.select().from(mapKmlFile)).toEqual([])
    expect(await harness.app.select().from(mapOrganization)).toEqual([])
  })
})

describe('write authority: a map is maintained by a superadmin', () => {
  it('refuses a member adding a map, and tidying the flat WITH CHECK away is what breaks this', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(map).values({ name: 'Placeholder Smuggled Map', slug: 'placeholder-smuggled' }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const landed = await harness.owner
      .select()
      .from(map)
      .where(eq(map.slug, 'placeholder-smuggled'))
    expect(landed).toEqual([])
  })

  it('refuses a member editing the slug every reader of the public map reaches it by', async () => {
    // `UPDATE` needs no restrictive policy of its own to refuse this - the member passes the
    // read and then fails the check, and there is no value of a map row that would make them
    // a superadmin
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.update(map).set({ slug: 'placeholder-taken' }).where(eq(map.id, ids.maps.shared)),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const [survivor] = await harness.owner.select().from(map).where(eq(map.id, ids.maps.shared))
    expect(survivor?.slug).toBe('placeholder-geozones')
  })

  it('refuses a member deleting a map, and deleting map_delete_superadmin_only is what breaks this', async () => {
    const refused = await withTenant(harness.app, alphaSession(), (tx) =>
      tx.delete(map).where(eq(map.id, ids.maps.shared)).returning({ id: map.id }),
    )
    // a restrictive policy filters the rows the statement matches, so this refusal is an
    // empty result rather than the throw the two above are - which is why it is the one that
    // fails silently if the policy is dropped
    expect(refused).toEqual([])

    // read back through the RLS-exempt owner connection, because a member's own read of a
    // surviving row proves nothing about whether the row survived
    const survivors = await harness.owner.select().from(map).where(eq(map.id, ids.maps.shared))
    expect(survivors).toHaveLength(1)
  })

  it('refuses a member deleting a layer, which is deleting the map one file at a time', async () => {
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(mapKmlFile)
        .where(eq(mapKmlFile.mapId, ids.maps.shared))
        .returning({ id: mapKmlFile.id }),
    )
    expect(removed).toEqual([])

    const survivors = await harness.owner
      .select()
      .from(mapKmlFile)
      .where(eq(mapKmlFile.mapId, ids.maps.shared))
    expect(survivors).toHaveLength(2)
  })

  it('lets a superadmin add a map, edit it and delete it, so none of the refusals above is a policy of false', async () => {
    const [added] = await withTenant(harness.app, superadminSession(), (tx) =>
      tx
        .insert(map)
        .values({ name: 'Placeholder Draft Map', slug: 'placeholder-draft' })
        .returning({ id: map.id }),
    )
    expect(added?.id).toBeGreaterThan(0)

    const edited = await withTenant(harness.app, superadminSession(), (tx) =>
      tx
        .update(map)
        .set({ allowDarkBasemap: true })
        .where(eq(map.id, added?.id ?? 0))
        .returning({ id: map.id }),
    )
    expect(edited).toHaveLength(1)

    // and a member reads what a superadmin published, which is what maintained-by-superadmin
    // means for a register every operator reads
    const entries = await withTenant(harness.app, alphaSession(), listMaps)
    expect(entries.map((entry) => entry.slug)).toContain('placeholder-draft')

    // and put the fixture back, so the reads at the top of this file stay the fixture's own
    const removed = await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(map).where(eq(map.id, added?.id ?? 0)).returning({ id: map.id }),
    )
    expect(removed).toHaveLength(1)
  })
})

describe('the assignment: a member reads their own and no other operator', () => {
  it('shows an alpha session the alpha assignment and not the bravo one on the same map', async () => {
    // the disclosure this policy exists to prevent is not the map - every session reads that
    // - it is *which other operators hold it*. widening this USING to the map's is what
    // breaks this test and nothing else.
    const rows = await withTenant(harness.app, alphaSession(), (tx) =>
      tx.select().from(mapOrganization).where(eq(mapOrganization.mapId, ids.maps.shared)),
    )
    expect(rows.map((row) => row.organizationId)).toEqual([ids.organizations.alpha])
  })

  it('shows the other operator its own assignment to the same map, and only its own', async () => {
    const rows = await withTenant(harness.app, bravoSession(), (tx) =>
      tx.select().from(mapOrganization).where(eq(mapOrganization.mapId, ids.maps.shared)),
    )
    expect(rows.map((row) => row.organizationId)).toEqual([ids.organizations.bravo])
  })

  it('shows a superadmin both, so neither read above is the whole assignment', async () => {
    const rows = await withTenant(harness.app, superadminSession(), (tx) =>
      tx.select().from(mapOrganization).where(eq(mapOrganization.mapId, ids.maps.shared)),
    )
    expect(rows).toHaveLength(2)
  })

  it('refuses a member assigning a map to their own organisation', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx
          .insert(mapOrganization)
          .values({ mapId: ids.maps.unassigned, organizationId: ids.organizations.alpha }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)
  })

  it('refuses a member unassigning their own organisation, and the restrictive DELETE is the only thing that does', async () => {
    // the row is one the tenant-scoped read above hands them, so `USING` alone would admit
    // this delete. the refusal is an empty result rather than a throw, which is exactly how
    // a missing restrictive policy would read as success.
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(mapOrganization)
        .where(
          and(
            eq(mapOrganization.mapId, ids.maps.shared),
            eq(mapOrganization.organizationId, ids.organizations.alpha),
          ),
        )
        .returning({ id: mapOrganization.id }),
    )
    expect(removed).toEqual([])

    const survivors = await harness.owner
      .select()
      .from(mapOrganization)
      .where(eq(mapOrganization.mapId, ids.maps.shared))
    expect(survivors).toHaveLength(2)
  })
})

describe('what a delete takes with it', () => {
  it('takes the layers and the assignments of a deleted map, and leaves the organisations standing', async () => {
    const [doomed] = await harness.owner
      .insert(map)
      .values({ name: 'Placeholder Retired Map', slug: 'placeholder-retired' })
      .returning({ id: map.id })
    const retired = doomed?.id ?? 0

    await harness.owner.insert(mapKmlFile).values({
      mapId: retired,
      filePath: 'map-layers/placeholder-retired-layer.kml',
      displayName: 'Placeholder Retired Layer',
    })
    await harness.owner
      .insert(mapOrganization)
      .values({ mapId: retired, organizationId: ids.organizations.alpha })

    const removed = await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(map).where(eq(map.id, retired)).returning({ id: map.id }),
    )
    expect(removed).toHaveLength(1)

    // a layer is not evidence apart from the map it details, and an assignment is not
    // evidence at all - both cascade
    expect(
      await harness.owner.select().from(mapKmlFile).where(eq(mapKmlFile.mapId, retired)),
    ).toEqual([])
    expect(
      await harness.owner.select().from(mapOrganization).where(eq(mapOrganization.mapId, retired)),
    ).toEqual([])

    // detach is not delete, read from the map's end: the operator the map was assigned to
    // survives losing the assignment
    const [survivor] = await harness.owner
      .select()
      .from(organization)
      .where(eq(organization.id, ids.organizations.alpha))
    expect(survivor?.name).toBe('Operator Alpha')
  })
})
