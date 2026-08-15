import { asc, eq } from 'drizzle-orm'
import { device, type Device } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// there is no organisation filter in this file, and that is the point. the queries are
// unscoped as written; the policies on `device` scope them, so an airframe belonging to
// another organisation is not hidden by a WHERE clause someone could forget - it does
// not exist as far as the connection is concerned.

export function listAirframes(tx: TenantTransaction): Promise<Device[]> {
  return tx.select().from(device).orderBy(asc(device.id))
}

// a cross-tenant id yields no rows, so the caller renders not-found. nothing here knows
// the record exists and decides to refuse it - a forbidden response would confirm the
// airframe is real, which is exactly what the boundary is for.
export async function findAirframe(tx: TenantTransaction, id: number): Promise<Device | null> {
  const [row] = await tx.select().from(device).where(eq(device.id, id)).limit(1)
  return row ?? null
}
