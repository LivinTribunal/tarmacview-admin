import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, person, training, trainingDevice, trainingType } from '@/lib/db/schema'
import { findTraining, listTrainings } from '@/lib/tenant/scoped-trainings'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the training register is the first row in the rebuild that reaches across two other
// tenant-owned tables - docs/specs/03-data-model.md §"Trainings in the rebuild". so this
// file carries two different claims: the ordinary policy scoping every register here has,
// and the one that is not a policy at all, that a cross-tenant reference is refused by the
// foreign key. the second half runs under a **superadmin** session, whose policy admits
// every row, so the constraint is the only thing left that can refuse it. downgrade either
// composite foreign key to a plain one and those cases go red while every read below stays
// green, which is precisely the failure mode they guard.
//
// everything runs through harness.app and nothing through harness.owner except the read-back
// checks: a missing GRANT surfaces as `permission denied` on the first member read.

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

// foreign_key_violation, so a downgrade to a plain reference reads as a different code
const FOREIGN_KEY_VIOLATION = '23503'

describe('tenant isolation: the training register under a member session', () => {
  it('an unscoped read returns only the acting tenant rows', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listTrainings)
    expect(rows.map((row) => row.name)).toEqual([
      'Alpha Recurrent Training',
      'Alpha Unclassified Training',
    ])
  })

  it('the other tenant sees its own, which is the half that makes the first mean something', async () => {
    const rows = await withTenant(harness.app, bravoSession(), listTrainings)
    expect(rows.map((row) => row.name)).toEqual(['Bravo Recurrent Training'])
  })

  it('a superadmin reaches both, so the two exclusions above are the policy and not an empty read', async () => {
    const rows = await withTenant(harness.app, superadminSession(), listTrainings)
    expect(rows).toHaveLength(3)
  })

  it('finds a training of the acting tenant by id', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findTraining(tx, ids.trainings.alphaRecurrent),
    )
    expect(found?.name).toBe('Alpha Recurrent Training')
  })

  it('a cross-tenant id returns not-found rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findTraining(tx, ids.trainings.bravoRecurrent),
    )
    // null, not a throw and not a refusal: refusing would confirm the row exists
    expect(found).toBeNull()
  })
})

describe('tenant isolation: the cells that aggregate across the boundary', () => {
  it('resolves the type and the pilot the acting session can read', async () => {
    const [recurrent] = await withTenant(harness.app, alphaSession(), listTrainings)
    expect(recurrent?.trainingTypeName).toBe('Alpha Initial Training')
    // readable through `person_shared_organization_or_self`, not through any column on
    // `training` - a pilot carries no organisation
    expect(recurrent?.pilotName).toBe('Alpha Pilot')
  })

  it('lists in `Zariadenia` only the airframes the acting session can read', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listTrainings)
    expect(rows[0]?.airframes).toEqual(['SN-ALPHA-0001'])

    // a training covering no airframe keeps a null rather than an empty list, so the cell
    // renders the blank marker
    expect(rows[1]?.airframes).toBeNull()
  })

  it('hides another operator pivot rows entirely, even from an unscoped select', async () => {
    const rows = await withTenant(harness.app, alphaSession(), (tx) =>
      tx.select().from(trainingDevice),
    )
    expect(rows.map((row) => row.organizationId)).toEqual([ids.organizations.alpha])
  })
})

// the half that is not a policy. a plain references(trainingType.id) would let each of
// these rows land: the row's own `organization_id` would be perfectly correct, and no
// policy on `training` would notice.
describe('what the schema refuses, under a session whose policy refuses nothing', () => {
  it('rejects a training classified by another operator syllabus entry', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(training).values({
          organizationId: ids.organizations.alpha,
          name: 'Smuggled Training',
          trainingTypeId: ids.trainingTypes.bravoInitial,
          pilotId: ids.people.alphaPilot,
        }),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('training_training_type_id_organization_id_fk')

    const landed = await harness.owner
      .select()
      .from(training)
      .where(eq(training.name, 'Smuggled Training'))
    expect(landed).toEqual([])
  })

  it('rejects a pivot row naming another operator airframe', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(trainingDevice).values({
          trainingId: ids.trainings.alphaRecurrent,
          deviceId: ids.airframes.bravoOne,
          organizationId: ids.organizations.alpha,
        }),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('training_device_device_id_organization_id_fk')
  })

  it('rejects the same reach from the other end, where the training is the foreign row', async () => {
    // naming bravo satisfies the airframe half and breaks the training half. both ends
    // carry the tenant, so there is no organisation_id that makes this row legal
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(trainingDevice).values({
          trainingId: ids.trainings.alphaRecurrent,
          deviceId: ids.airframes.bravoOne,
          organizationId: ids.organizations.bravo,
        }),
      ),
    )
    expect(refused.constraint_name).toBe('training_device_training_id_organization_id_fk')

    const landed = await harness.owner.select().from(trainingDevice)
    expect(landed).toHaveLength(2)
  })

  it('accepts a null training type, because MATCH SIMPLE leaves the constraint unenforced', async () => {
    // the reason `training_type_id` may be nullable at all beside a composite foreign key
    const rows = await withTenant(harness.app, alphaSession(), listTrainings)
    expect(rows[1]?.trainingTypeId).toBeNull()
    expect(rows[1]?.trainingTypeName).toBeNull()
  })
})

describe('what the training schema itself decides: writes and deletes', () => {
  it('lets a member write a training into their own organisation', async () => {
    await withTenant(harness.app, alphaSession(), (tx) =>
      tx.insert(training).values({
        organizationId: ids.organizations.alpha,
        name: 'Alpha Emergency Response Training',
        pilotId: ids.people.alphaPilot,
      }),
    )

    const rows = await withTenant(harness.app, alphaSession(), listTrainings)
    expect(rows.map((row) => row.name)).toContain('Alpha Emergency Response Training')
  })

  it('refuses a write that names another organisation', async () => {
    // `training_type_id` is left null so the composite foreign key stays unenforced and
    // the refusal can only be the WITH CHECK
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(training).values({
          organizationId: ids.organizations.bravo,
          name: 'Smuggled Cross-Tenant Training',
          pilotId: ids.people.alphaPilot,
        }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const landed = await harness.owner
      .select()
      .from(training)
      .where(eq(training.name, 'Smuggled Cross-Tenant Training'))
    expect(landed).toEqual([])
  })

  it('refuses deleting a syllabus entry that classifies a training, and allows one that classifies none', async () => {
    // the deferral docs/specs/03-data-model.md §"Training types in the rebuild" left open:
    // the hard delete is now blocked while a training points at the entry. a throw and not
    // an empty result - the policy admits the row, so it is the foreign key refusing
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.delete(trainingType).where(eq(trainingType.id, ids.trainingTypes.alphaInitial)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('training_training_type_id_organization_id_fk')

    // and the other half, or a constraint that refused everything would pass this test
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(trainingType)
        .where(eq(trainingType.id, ids.trainingTypes.alphaOperational))
        .returning({ id: trainingType.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('refuses deleting an airframe a training says it covered', async () => {
    // the airframe comment in src/lib/db/schema.ts says a dependent holding history must
    // restrict, or a member deletes the evidence with the row. `training_device` is the
    // first one to do it.
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.delete(device).where(eq(device.id, ids.airframes.alphaOne)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('training_device_device_id_organization_id_fk')
  })

  it('deletes the pivot rows with the training and neither the airframe nor the person', async () => {
    // detach is not delete, read from the training end: the link goes, the airframe stays
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(training)
        .where(eq(training.id, ids.trainings.alphaRecurrent))
        .returning({ id: training.id }),
    )
    expect(removed).toHaveLength(1)

    const pivot = await harness.owner
      .select()
      .from(trainingDevice)
      .where(eq(trainingDevice.trainingId, ids.trainings.alphaRecurrent))
    expect(pivot).toEqual([])

    const airframes = await harness.owner
      .select()
      .from(device)
      .where(eq(device.id, ids.airframes.alphaOne))
    expect(airframes).toHaveLength(1)

    const survivors = await harness.owner
      .select()
      .from(person)
      .where(eq(person.id, ids.people.alphaPilot))
    expect(survivors).toHaveLength(1)
  })
})
