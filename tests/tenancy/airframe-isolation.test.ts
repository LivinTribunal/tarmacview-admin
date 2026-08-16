import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, membership, person } from '@/lib/db/schema'
import { findAirframe, listAirframes } from '@/lib/tenant/scoped-airframes'
import { withTenant } from '@/lib/tenant/tenant-context'
import { APP_LOGIN_ROLE, startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the subject is the airframe, not the device type: the catalogue is deployment-wide
// and carries no organisation binding, so it has nothing to scope
// (docs/specs/03-data-model.md §"Device types in the rebuild").

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

// a policy that is never reached proves nothing, and three ordinary mistakes make that
// happen invisibly: a superuser connection, a BYPASSRLS grant, and an owner connection
// to a table that only ENABLEs row-level security instead of FORCEing it.
describe('tenant isolation: the boundary is actually in force', () => {
  it('the application role is neither a superuser nor exempt from row-level security', async () => {
    const rows = await harness.owner.execute(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = ${APP_LOGIN_ROLE}`,
    )
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it('every tenant-owned table forces row-level security, so not even its owner escapes', async () => {
    const rows = await harness.owner.execute(
      sql`select relname, relrowsecurity, relforcerowsecurity from pg_class
          where relname in ('organization', 'person', 'membership', 'device', 'training_type',
                            'training', 'training_device')
          order by relname`,
    )
    expect(rows).toHaveLength(7)
    for (const row of rows) {
      expect(row, `${row.relname} is not fully protected`).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      })
    }
  })

  it('a connection with no tenant context reads nothing at all', async () => {
    const rows = await harness.app.select().from(device)
    expect(rows).toEqual([])
  })
})

describe('tenant isolation: the airframe register under a member session', () => {
  const alphaSession = () => ({ personId: ids.people.alphaManager, systemRole: 'member' as const })

  it('an unscoped query returns only the acting tenant rows', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listAirframes)
    expect(rows.map((row) => row.serialNumber).sort()).toEqual(['SN-ALPHA-0001', 'SN-ALPHA-0002'])
  })

  it('finds an airframe of the acting tenant by id', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findAirframe(tx, ids.airframes.alphaOne),
    )
    expect(found?.serialNumber).toBe('SN-ALPHA-0001')
  })

  it('a cross-tenant id returns not-found rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findAirframe(tx, ids.airframes.bravoOne),
    )
    // null, not a throw and not a refusal: refusing would confirm the row exists
    expect(found).toBeNull()
  })

  it('the other tenant sees its own airframe and only its own', async () => {
    const rows = await withTenant(
      harness.app,
      { personId: ids.people.bravoManager, systemRole: 'member' },
      listAirframes,
    )
    expect(rows.map((row) => row.serialNumber)).toEqual(['SN-BRAVO-0001'])
  })

  it('a person with no membership sees nothing and is not an error', async () => {
    const rows = await withTenant(
      harness.app,
      { personId: ids.people.systemAdmin, systemRole: 'member' },
      listAirframes,
    )
    expect(rows).toEqual([])
  })

  it('a superadmin session reaches both organisations', async () => {
    const rows = await withTenant(
      harness.app,
      { personId: ids.people.systemAdmin, systemRole: 'superadmin' },
      listAirframes,
    )
    expect(rows.map((row) => row.serialNumber).sort()).toEqual([
      'SN-ALPHA-0001',
      'SN-ALPHA-0002',
      'SN-BRAVO-0001',
    ])
  })
})

describe('tenant isolation: what the schema itself decides', () => {
  it('the person carries no organization_id, so nothing can scope by one', async () => {
    const rows = await harness.owner.execute(
      sql`select column_name from information_schema.columns where table_name = 'person'`,
    )
    expect(rows.map((row) => row.column_name)).not.toContain('organization_id')
  })

  it('the device-type catalogue is deployment-wide: no organisation column, no policy', async () => {
    const columns = await harness.owner.execute(
      sql`select column_name from information_schema.columns where table_name = 'device_type'`,
    )
    expect(columns.map((row) => row.column_name)).not.toContain('organization_id')

    const [table] = await harness.owner.execute(
      sql`select relrowsecurity from pg_class where relname = 'device_type'`,
    )
    expect(table).toMatchObject({ relrowsecurity: false })
  })

  it('detaching a person from an organisation does not delete the person', async () => {
    await harness.owner
      .delete(membership)
      .where(
        and(
          eq(membership.personId, ids.people.alphaPilot),
          eq(membership.organizationId, ids.organizations.alpha),
        ),
      )

    const [pilot] = await harness.owner
      .select()
      .from(person)
      .where(eq(person.id, ids.people.alphaPilot))
    expect(pilot?.name).toBe('Alpha Pilot')

    // and the pilot who is now attached to nothing sees nothing, which is a state
    // rather than a fault
    const rows = await withTenant(
      harness.app,
      { personId: ids.people.alphaPilot, systemRole: 'member' },
      listAirframes,
    )
    expect(rows).toEqual([])
  })
})
