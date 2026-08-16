import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { device, membership, organization, type Organization } from '@/lib/db/schema'
import type { TenantSession, TenantTransaction } from '@/lib/tenant/tenant-context'

// no organisation filter here, for the same reason there is none in scoped-airframes.ts
// or scoped-training-types.ts: `organization_tenant_isolation` scopes these reads, so
// another operator's tenant row is not hidden by a WHERE clause somebody could forget -
// it does not exist as far as the connection is concerned.

export type OrganizationEntry = Organization & {
  airframeCount: number
  // null where the acting session cannot count people - see below. a gap is reported as
  // a gap, never as a number that means something narrower than it reads.
  peopleCount: number | null
}

// the airframe count follows the precedent in src/lib/device-types/catalogue.ts: joined
// and counted inside the tenant transaction, so `device_tenant_isolation` scopes it and a
// member counts their own fleet while a superadmin counts the deployment. two joins need
// `distinct` - each multiplies the other's rows out, and count() would report the product.
//
// the people count cannot be read that way. `membership_own_or_superadmin` selects the
// acting person's *own* rows, so a member counting memberships reads 1 for an
// organisation of twelve. So it is counted for a superadmin and left null for everyone
// else, until the shared-membership policy the organisation people register needs exists.
export function listOrganizations(
  tx: TenantTransaction,
  session: TenantSession,
): Promise<OrganizationEntry[]> {
  const peopleCount =
    session.systemRole === 'superadmin'
      ? sql<number | null>`count(distinct ${membership.id})::int`
      : sql<number | null>`null::int`

  return tx
    .select({
      ...getTableColumns(organization),
      airframeCount: sql<number>`count(distinct ${device.id})::int`,
      peopleCount,
    })
    .from(organization)
    .leftJoin(device, eq(device.organizationId, organization.id))
    .leftJoin(membership, eq(membership.organizationId, organization.id))
    .groupBy(organization.id)
    .orderBy(asc(organization.id))
}

// a cross-tenant id yields no rows, so the caller renders not-found. refusing would
// confirm the record is real, which is exactly what the boundary is for.
export async function findOrganization(
  tx: TenantTransaction,
  id: number,
): Promise<Organization | null> {
  const [row] = await tx.select().from(organization).where(eq(organization.id, id)).limit(1)
  return row ?? null
}
