import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { training, trainingType, type TrainingType } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// no organisation filter here, for the same reason there is none in scoped-airframes.ts:
// the policy on `training_type` scopes these reads, so another operator's syllabus is not
// hidden by a WHERE clause somebody could forget - it does not exist as far as the
// connection is concerned.

export type TrainingTypeEntry = TrainingType & { trainingCount: number }

// doc 04's `Školenia` count, following the airframe-count precedent in
// src/lib/device-types/catalogue.ts: joined and counted inside the tenant transaction, so
// `training_tenant_isolation` scopes it and a member counts their own syllabus usage while
// a superadmin counts the deployment. one join, so unlike scoped-organizations.ts it needs
// no `distinct` - there is no second join to multiply this one's rows out.
export function listTrainingTypes(tx: TenantTransaction): Promise<TrainingTypeEntry[]> {
  return tx
    .select({
      ...getTableColumns(trainingType),
      trainingCount: sql<number>`count(${training.id})::int`,
    })
    .from(trainingType)
    .leftJoin(training, eq(training.trainingTypeId, trainingType.id))
    .groupBy(trainingType.id)
    .orderBy(asc(trainingType.id))
}

// a cross-tenant id yields no rows, so the caller renders not-found. refusing would
// confirm the record is real, which is exactly what the boundary is for.
export async function findTrainingType(
  tx: TenantTransaction,
  id: number,
): Promise<TrainingType | null> {
  const [row] = await tx.select().from(trainingType).where(eq(trainingType.id, id)).limit(1)
  return row ?? null
}
