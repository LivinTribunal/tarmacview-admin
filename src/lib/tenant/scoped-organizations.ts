import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm'
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
// the people count is left null for a member and counted only for a superadmin.
// `membership_tenant_isolation` now admits a co-member's row, so the count is readable -
// but showing it is the people register's slice, and a number appearing here ahead of the
// register it belongs to is chrome ahead of its subject.
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

// the acting session's primary organisation, which is what `/` lands on -
// docs/specs/03-data-model.md §"Membership in the rebuild" decides that it derives from the
// primary-contact flag on a membership and never from a column on the person.
//
// the `person_id` filter is **load-bearing and not a selection**, unlike every other
// organisation filter in this directory. `membership_tenant_isolation` admits every
// attachment to an organisation the acting person belongs to and a superadmin's context
// admits the deployment's, so dropping it would land a co-member - or a superadmin - on
// somebody else's report with every gate green.
//
// several primary-contact rows resolve by lowest organisation id, so the destination is the
// same on every visit. none is null and not an error: a superadmin belonging to no
// organisation is the ordinary case, and the caller keeps the interim destination.
export async function findPrimaryOrganization(
  tx: TenantTransaction,
  session: TenantSession,
): Promise<number | null> {
  const [row] = await tx
    .select({ organizationId: membership.organizationId })
    .from(membership)
    .where(and(eq(membership.personId, session.personId), eq(membership.isPrimaryContact, true)))
    .orderBy(asc(membership.organizationId))
    .limit(1)

  return row?.organizationId ?? null
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
