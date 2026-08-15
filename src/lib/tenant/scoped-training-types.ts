import { asc, eq } from 'drizzle-orm'
import { trainingType, type TrainingType } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// no organisation filter here, for the same reason there is none in scoped-airframes.ts:
// the policy on `training_type` scopes these reads, so another operator's syllabus is not
// hidden by a WHERE clause somebody could forget - it does not exist as far as the
// connection is concerned.

export function listTrainingTypes(tx: TenantTransaction): Promise<TrainingType[]> {
  return tx.select().from(trainingType).orderBy(asc(trainingType.id))
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
