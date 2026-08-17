import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, deviceType } from '@/lib/db/schema'
import { listDeviceTypes } from '@/lib/device-types/catalogue'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the deployment-wide catalogue - docs/specs/03-data-model.md §"Catalogue write authority in
// the rebuild". the one table in the schema with no organisation column at all, so its policy
// narrows by system role where every other one narrows by tenant: every session reads the
// catalogue, and a superadmin maintains it.
//
// nothing in the rebuild writes a device type - the only write path is authentication - so
// the refusals below drive the database directly under a session, the way
// tests/tenancy/document-isolation.test.ts does. each is named for what breaks it, because
// none of the three pieces is visible from a read: drop the policy's `WITH CHECK`, drop the
// restrictive delete policy, or widen the read to `true`, and every other test here stays
// green.

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
// the copies in document-, training- and flight-isolation, though only `message` is read
// here: what refuses a write to this table is a policy, and no constraint is involved.
type Refusal = { code?: string; constraint_name?: string; message?: string }

async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run()
  } catch (error) {
    return ((error as { cause?: Refusal }).cause ?? {}) as Refusal
  }
  throw new Error('the statement was not refused')
}

describe('the catalogue every session reads', () => {
  it('lists the catalogue to a member, with the airframe count of their own fleet beside it', async () => {
    const entries = await withTenant(harness.app, alphaSession(), listDeviceTypes)
    expect(entries.map((entry) => entry.name)).toEqual(['Placeholder Quadcopter'])

    // the entry is deployment-wide and the count beside it is not: `device` is tenant-owned,
    // so this member counts the one airframe of theirs that carries the type
    expect(entries[0]?.airframeCount).toBe(1)
  })

  it('lists the same entry to the other operator, which is the half that makes the first mean something', async () => {
    const entries = await withTenant(harness.app, bravoSession(), listDeviceTypes)
    expect(entries.map((entry) => entry.id)).toEqual([ids.deviceType])
    expect(entries[0]?.airframeCount).toBe(1)
  })

  it('counts the deployment for a superadmin, so neither count above is the whole fleet', async () => {
    const entries = await withTenant(harness.app, superadminSession(), listDeviceTypes)
    expect(entries[0]?.airframeCount).toBe(2)
  })

  it('reads nothing at all from a connection with no tenant context', async () => {
    // the read asks for a resolved acting person rather than saying `true`, so the invariant
    // the rest of tests/tenancy asserts holds on this table too: every session reads the
    // catalogue, and a connection that is nobody is not a session.
    const rows = await harness.app.select().from(deviceType)
    expect(rows).toEqual([])
  })

  it('lets a member write an airframe that names a catalogue entry they may not write', async () => {
    // `device.device_type_id` references a table that now carries policies, and a foreign
    // key check reads it. Postgres runs referential integrity outside row-level security, so
    // pointing at the catalogue survives being unable to edit it - which is the half of this
    // slice that had to break nothing.
    const [airframe] = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .insert(device)
        .values({
          organizationId: ids.organizations.alpha,
          serialNumber: 'SN-ALPHA-0008',
          deviceTypeId: ids.deviceType,
        })
        .returning({ id: device.id }),
    )
    expect(airframe?.id).toBeGreaterThan(0)

    // and put the fixture back, so the counts above stay the fixture's own
    await harness.owner.delete(device).where(eq(device.id, airframe?.id ?? 0))
  })
})

describe('write authority: the catalogue is maintained by a superadmin', () => {
  it('refuses a member adding a catalogue entry, and tidying the flat WITH CHECK away is what breaks this', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(deviceType).values({ name: 'Placeholder Smuggled Type', maxVlos: '500' }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const landed = await harness.owner
      .select()
      .from(deviceType)
      .where(eq(deviceType.name, 'Placeholder Smuggled Type'))
    expect(landed).toEqual([])
  })

  it('refuses a member editing the VLOS limit every operator flying the type is judged on', async () => {
    // the quiet half of the gap: this edit re-judges every past and future flight of every
    // operator on that type. `UPDATE` needs no restrictive policy of its own to refuse it -
    // the member passes the read and then fails the check, and there is no value of a
    // catalogue row that would make them a superadmin.
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.update(deviceType).set({ maxVlos: '99999' }).where(eq(deviceType.id, ids.deviceType)),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const [survivor] = await harness.owner
      .select()
      .from(deviceType)
      .where(eq(deviceType.id, ids.deviceType))
    expect(survivor?.maxVlos).toBe('500')
  })

  it('refuses a member deleting a catalogue entry, and deleting device_type_delete_superadmin_only is what breaks this', async () => {
    const [entry] = await harness.owner
      .insert(deviceType)
      .values({ name: 'Placeholder Retired Type', maxVlos: '300', serviceInterval: 20 })
      .returning({ id: deviceType.id })
    const retired = entry?.id ?? 0
    const [airframe] = await harness.owner
      .insert(device)
      .values({
        organizationId: ids.organizations.alpha,
        serialNumber: 'SN-ALPHA-0009',
        deviceTypeId: retired,
      })
      .returning({ id: device.id })

    const refused = await withTenant(harness.app, alphaSession(), (tx) =>
      tx.delete(deviceType).where(eq(deviceType.id, retired)).returning({ id: deviceType.id }),
    )
    // a restrictive policy filters the rows the statement matches, so this refusal is an
    // empty result rather than the throw the two above are
    expect(refused).toEqual([])

    // read back through the RLS-exempt owner connection, because a member's own read of a
    // surviving row proves nothing about whether the row survived
    const survivors = await harness.owner
      .select()
      .from(deviceType)
      .where(eq(deviceType.id, retired))
    expect(survivors).toHaveLength(1)

    const [typed] = await harness.owner.select().from(device).where(eq(device.id, airframe?.id ?? 0))
    expect(typed?.deviceTypeId).toBe(retired)

    // a superadmin still may, and this is what that costs: `device.device_type_id` is
    // `ON DELETE set null`, so one catalogue row deleted leaves every airframe of that type
    // in the deployment with no VLOS limit and no service interval - a gap that never
    // registers a violation and reads as a clean sheet. the authority is the only thing
    // between a member and that.
    const removed = await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(deviceType).where(eq(deviceType.id, retired)).returning({ id: deviceType.id }),
    )
    expect(removed).toHaveLength(1)

    const [untyped] = await harness.owner
      .select()
      .from(device)
      .where(eq(device.id, airframe?.id ?? 0))
    expect(untyped?.deviceTypeId).toBeNull()
  })

  it('lets a superadmin add an entry and edit it, so none of the three refusals above is a policy of false', async () => {
    const [added] = await withTenant(harness.app, superadminSession(), (tx) =>
      tx
        .insert(deviceType)
        .values({ name: 'Placeholder Fixed-Wing', maxVlos: '1200', serviceInterval: 25 })
        .returning({ id: deviceType.id }),
    )
    expect(added?.id).toBeGreaterThan(0)

    const edited = await withTenant(harness.app, superadminSession(), (tx) =>
      tx
        .update(deviceType)
        .set({ maxVlos: '1500' })
        .where(eq(deviceType.id, added?.id ?? 0))
        .returning({ id: deviceType.id }),
    )
    expect(edited).toHaveLength(1)

    // and a member reads what a superadmin published, which is what maintained-by-superadmin
    // means for a catalogue every operator flies against
    const entries = await withTenant(harness.app, alphaSession(), listDeviceTypes)
    expect(entries.map((entry) => entry.name)).toContain('Placeholder Fixed-Wing')

    // and put the fixture back, so the reads at the top of this file stay the fixture's own
    await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(deviceType).where(eq(deviceType.id, added?.id ?? 0)),
    )
  })
})
