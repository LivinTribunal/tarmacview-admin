import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { trainingType } from '@/lib/db/schema'
import { findTrainingType, listTrainingTypes } from '@/lib/tenant/scoped-training-types'
import { withTenant } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the training-type register is tenant-owned - docs/specs/03-data-model.md §"Training
// types in the rebuild" - so unlike the device-type catalogue it has a boundary to prove.
// this is the test that carries that claim: it fails if the policy is dropped, mis-scoped,
// or replaced by a WHERE clause in the read.

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const alphaSession = () => ({ personId: ids.people.alphaManager, systemRole: 'member' as const })
const bravoSession = () => ({ personId: ids.people.bravoManager, systemRole: 'member' as const })

describe('tenant isolation: the training-type register under a member session', () => {
  it('an unscoped read returns only the acting tenant rows', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listTrainingTypes)
    expect(rows.map((row) => row.name).sort()).toEqual([
      'Alpha Initial Training',
      'Alpha Operational Training',
    ])
  })

  it('the other tenant sees its own, which is the half that makes the first mean something', async () => {
    const rows = await withTenant(harness.app, bravoSession(), listTrainingTypes)
    expect(rows.map((row) => row.name)).toEqual(['Bravo Initial Training'])
  })

  it('a superadmin reaches both, so the two exclusions above are the policy and not an empty read', async () => {
    const rows = await withTenant(
      harness.app,
      { personId: ids.people.systemAdmin, systemRole: 'superadmin' },
      listTrainingTypes,
    )
    expect(rows).toHaveLength(3)
  })

  it('finds a training type of the acting tenant by id', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findTrainingType(tx, ids.trainingTypes.alphaInitial),
    )
    expect(found?.code).toBe('A1')
  })

  it('a cross-tenant id returns not-found rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findTrainingType(tx, ids.trainingTypes.bravoInitial),
    )
    // null, not a throw and not a refusal: refusing would confirm the row exists
    expect(found).toBeNull()
  })

  it('the table forces row-level security, so not even its owner escapes the policy', async () => {
    const [table] = await harness.owner.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'training_type'`,
    )
    expect(table).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true })
  })
})

describe('tenant isolation: what the training-type schema itself decides', () => {
  it('holds the same code under two operators, because `code` is unique per organisation', async () => {
    const rows = await harness.owner.select().from(trainingType).where(eq(trainingType.code, 'A1'))

    // a deployment-wide unique(code) would have rejected the second of these at seed time
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.organizationId)).size).toBe(2)
  })

  it('lets a member write into their own organisation, which a superadmin-only check would refuse', async () => {
    await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .insert(trainingType)
        .values({
          organizationId: ids.organizations.alpha,
          name: 'Alpha Emergency Response Procedures',
          code: 'ERP',
        })
        .returning({ id: trainingType.id }),
    )

    const rows = await withTenant(harness.app, alphaSession(), listTrainingTypes)
    expect(rows.map((row) => row.code)).toContain('ERP')
  })

  it('refuses a write that names another organisation', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(trainingType).values({
          organizationId: ids.organizations.bravo,
          name: 'Smuggled Training Type',
          code: 'SMUGGLED',
        }),
      ),
    ).rejects.toThrow()

    // and nothing landed: the check rejected the row rather than writing it somewhere
    const rows = await harness.owner
      .select()
      .from(trainingType)
      .where(eq(trainingType.code, 'SMUGGLED'))
    expect(rows).toEqual([])
  })
})
