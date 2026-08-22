import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, maintenanceLog } from '@/lib/db/schema'
import { listOrganizationAirframeReport } from '@/lib/tenant/scoped-airframes'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the maintenance history is the airworthiness record - docs/specs/03-data-model.md
// §"Maintenance log in the rebuild" - so getting this wrong corrupts what an operator can
// show a regulator rather than showing a wrong screen. tier-3 evidence, against a real
// database.
//
// three different claims live here: the ordinary policy scoping every register has, the one
// that is not a policy at all - that a maintenance record naming another operator's airframe
// is refused by the **foreign key** - and the `restrict` that keeps a serviced airframe from
// being deleted out from under its own history.
//
// the foreign-key half runs under a **superadmin** session, whose policy admits every row,
// so the constraint is the only thing left that can refuse it. downgrade the composite key to
// a plain references(device.id) and those cases go red while every read below stays green,
// which is precisely the failure mode they guard.
//
// everything runs through harness.app: `maintenance_log` is created long after 0001, so its
// schema-wide grant does not reach it, and a missing GRANT on the table or on its sequence
// surfaces here as `permission denied` rather than as a puzzle later.

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

// drizzle wraps the driver error, so the half worth asserting on - the Postgres error code
// and the constraint that refused - is on `cause`. naming it is the difference between
// "something refused this" and "the foreign key refused this": a missing GRANT throws too,
// and would satisfy a bare rejects.toThrow().
type Refusal = { code?: string; constraint_name?: string; message?: string }

async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run()
  } catch (error) {
    return ((error as { cause?: Refusal }).cause ?? {}) as Refusal
  }
  throw new Error('the statement was not refused')
}

const FOREIGN_KEY_VIOLATION = '23503'

// no deployment-wide maintenance register exists, so the read with no organisation clause is
// written out here rather than exported from src/ for one caller. what it proves is the
// policy: drop `maintenance_log_tenant_isolation` and this returns the whole deployment.
const listEveryRecord = (session: TenantSession) =>
  withTenant(harness.app, session, (tx) =>
    tx.select().from(maintenanceLog).orderBy(maintenanceLog.id),
  )

describe('tenant isolation: the maintenance history under a member session', () => {
  it('an unscoped read returns only the acting tenant rows', async () => {
    const rows = await listEveryRecord(alphaSession())
    expect(rows.map((row) => row.maintenanceDate)).toEqual(['2026-05-20', '2026-07-05'])
  })

  it('the other tenant sees its own, which is the half that makes the first mean something', async () => {
    const rows = await listEveryRecord(bravoSession())
    expect(rows.map((row) => row.maintenanceDate)).toEqual(['2026-06-10'])
  })

  it('a superadmin reaches both, so the two exclusions above are the policy and not an empty read', async () => {
    const rows = await listEveryRecord(superadminSession())
    expect(rows).toHaveLength(3)
  })

  it('the fleet read carries each airframe own history and no other operator', async () => {
    const airframes = await withTenant(harness.app, alphaSession(), (tx) =>
      listOrganizationAirframeReport(tx, ids.organizations.alpha),
    )
    const serviced = airframes.find(
      (airframe) => airframe.device.id === ids.airframes.alphaServiced,
    )

    // newest first, which is the order the composed baseline reads them in
    expect(serviced?.maintenance.map((log) => log.maintenanceDate)).toEqual([
      '2026-07-05',
      '2026-05-20',
    ])

    // and an airframe never serviced carries an empty history rather than somebody else's
    const untyped = airframes.find((airframe) => airframe.device.id === ids.airframes.alphaTwo)
    expect(untyped?.maintenance).toEqual([])
    expect(airframes.flatMap((airframe) => airframe.maintenance)).toHaveLength(2)
  })

  it('reads another operator fleet as absent rather than as refused', async () => {
    const airframes = await withTenant(harness.app, alphaSession(), (tx) =>
      listOrganizationAirframeReport(tx, ids.organizations.bravo),
    )

    // empty, not a throw: the policy is what empties this, and the handler turns it into the
    // same not-found every other refusal gets
    expect(airframes).toEqual([])
  })

  it('a connection with no tenant context reads nothing at all', async () => {
    // the policies deny where no acting person is set, which is the safe direction and the
    // reason seeding is a deployment concern rather than an application one
    const rows = await harness.app.select().from(maintenanceLog)
    expect(rows).toEqual([])
  })
})

describe('what the schema refuses, under a session whose policy refuses nothing', () => {
  it('rejects a maintenance record naming another operator airframe', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(maintenanceLog).values({
          organizationId: ids.organizations.alpha,
          deviceId: ids.airframes.bravoOne,
          maintenanceDate: '2026-07-01',
          totalFlightHours: '10:00',
        }),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('maintenance_log_device_id_organization_id_fk')

    const landed = await harness.owner
      .select()
      .from(maintenanceLog)
      .where(eq(maintenanceLog.maintenanceDate, '2026-07-01'))
    expect(landed).toEqual([])
  })

  it('rejects the same reach from the other end, where the record carries the foreign tenant', async () => {
    // naming bravo makes the airframe half fail instead. the tenant travels with the
    // airframe, so there is no organisation_id that makes this row legal
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(maintenanceLog).values({
          organizationId: ids.organizations.bravo,
          deviceId: ids.airframes.alphaServiced,
          maintenanceDate: '2026-07-02',
          totalFlightHours: '10:00',
        }),
      ),
    )
    expect(refused.constraint_name).toBe('maintenance_log_device_id_organization_id_fk')
  })
})

describe('what the maintenance schema itself decides: writes and deletes', () => {
  it('lets a member file a record stating no cycle count, and reads it back as stated', async () => {
    // the insert is also what exercises the sequence GRANT - a missing one fails here on
    // nextval rather than anywhere the read could explain
    await withTenant(harness.app, alphaSession(), (tx) =>
      tx.insert(maintenanceLog).values({
        organizationId: ids.organizations.alpha,
        deviceId: ids.airframes.alphaServiced,
        maintenanceDate: '2026-08-11',
        totalFlightHours: '44,25',
      }),
    )

    const [filed] = (await listEveryRecord(alphaSession())).filter(
      (row) => row.maintenanceDate === '2026-08-11',
    )

    // null and not zero: no count was stated, and a zero would be a reading nobody took
    expect(filed?.totalFlights).toBeNull()

    // the technician's own notation, decimal comma included, stored as stated
    expect(filed?.totalFlightHours).toBe('44,25')

    await harness.owner.delete(maintenanceLog).where(eq(maintenanceLog.id, filed?.id ?? 0))
  })

  it('refuses a write that names another organisation', async () => {
    // the airframe named is alpha's own, so the composite foreign key is satisfied and the
    // refusal can only be the WITH CHECK
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(maintenanceLog).values({
          organizationId: ids.organizations.bravo,
          deviceId: ids.airframes.alphaServiced,
          maintenanceDate: '2026-08-12',
          totalFlightHours: '10:00',
        }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)
  })

  it('refuses deleting an airframe carrying maintenance history, and allows one carrying none', async () => {
    // the promise `device` makes in the schema: an airframe that was serviced cannot be
    // deleted out from under the airworthiness record. `alphaServiced` carries no training
    // and no flight, so this constraint is the only one that can be refusing.
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.delete(device).where(eq(device.id, ids.airframes.alphaServiced)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('maintenance_log_device_id_organization_id_fk')

    // and the other half, or a constraint that refused every airframe would pass this test
    const spare = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .insert(device)
        .values({ organizationId: ids.organizations.alpha, serialNumber: 'SN-ALPHA-0006' })
        .returning({ id: device.id }),
    )
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(device)
        .where(eq(device.id, spare[0]?.id ?? 0))
        .returning({ id: device.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('lets the owning tenant delete its own record, which no restrictive policy narrows', async () => {
    // a maintenance record is the operator's own and deleting one is the same authority as
    // writing one - docs/specs/03-data-model.md §"Delete authority in the rebuild". what
    // protects the history from a member is the `restrict` on the composite key into
    // `device`, not a policy here.
    const removed = await withTenant(harness.app, bravoSession(), (tx) =>
      tx
        .delete(maintenanceLog)
        .where(eq(maintenanceLog.id, ids.maintenance.bravoService))
        .returning({ id: maintenanceLog.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('refuses a member deleting the other operator record, and leaves it standing', async () => {
    const removed = await withTenant(harness.app, bravoSession(), (tx) =>
      tx
        .delete(maintenanceLog)
        .where(eq(maintenanceLog.id, ids.maintenance.alphaFirstService))
        .returning({ id: maintenanceLog.id }),
    )
    expect(removed).toEqual([])

    // read back through the RLS-exempt owner connection: the member's own read is scoped, so
    // an empty read there would prove nothing about whether the row survived
    const survivors = await harness.owner
      .select()
      .from(maintenanceLog)
      .where(eq(maintenanceLog.id, ids.maintenance.alphaFirstService))
    expect(survivors).toHaveLength(1)
  })
})
