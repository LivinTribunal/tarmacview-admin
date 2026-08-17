import { asc, eq, getTableColumns } from 'drizzle-orm'
import { device, deviceType, type Device } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// there is no *tenant* filter in this file, and that is the point. the queries carry no
// organisation predicate that scopes them; the policies on `device` do, so an airframe
// belonging to another organisation is not hidden by a WHERE clause someone could forget
// - it does not exist as far as the connection is concerned.
//
// `listOrganizationAirframes` below is the one exception to the sentence above and not to
// the rule under it. it carries `where organization_id`, and that clause is a **selection
// and never a boundary** - the same line src/lib/tenant/scoped-documents.ts draws for
// `bucket`: it is the organisation being looked at, never the tenant a session is confined
// to. Dropping it widens the register to the acting session's *own* airframes across their
// other organisations, and never past them, which is the difference between a wrong screen
// and a breach. tests/tenancy/organization-workspace.test.ts asserts exactly that.

export type AirframeEntry = Device & { deviceTypeName: string | null }

// one select map for both reads, so the register and the unscoped list cannot drift apart
// unnoticed. the device type comes along because the register renders its absence as a
// visible gap - an airframe with no device type has no VLOS limit and no service interval
// - and a left join is what keeps such an airframe in the result at all.
const airframeEntry = { ...getTableColumns(device), deviceTypeName: deviceType.name }

export function listAirframes(tx: TenantTransaction): Promise<AirframeEntry[]> {
  return tx
    .select(airframeEntry)
    .from(device)
    .leftJoin(deviceType, eq(deviceType.id, device.deviceTypeId))
    .orderBy(asc(device.id))
}

// doc 05 §2's UAS tab: the fleet of the organisation whose workspace is open, which is one
// of the organisations the acting session already reads and not a wider set.
export function listOrganizationAirframes(
  tx: TenantTransaction,
  organizationId: number,
): Promise<AirframeEntry[]> {
  return tx
    .select(airframeEntry)
    .from(device)
    .leftJoin(deviceType, eq(deviceType.id, device.deviceTypeId))
    .where(eq(device.organizationId, organizationId))
    .orderBy(asc(device.id))
}

// a cross-tenant id yields no rows, so the caller renders not-found. nothing here knows
// the record exists and decides to refuse it - a forbidden response would confirm the
// airframe is real, which is exactly what the boundary is for.
export async function findAirframe(tx: TenantTransaction, id: number): Promise<Device | null> {
  const [row] = await tx.select().from(device).where(eq(device.id, id)).limit(1)
  return row ?? null
}
