import { and, asc, eq, getTableColumns, ne, sql, type SQL } from 'drizzle-orm'
import {
  membership,
  organization,
  person,
  type OrganizationRole,
  type Person,
} from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// no organisation filter here, for the same reason there is none in scoped-airframes.ts,
// scoped-training-types.ts or scoped-organizations.ts: `person_shared_organization_or_self`
// and `membership_tenant_isolation` scope these reads, so another operator's staff is not
// hidden by a WHERE clause somebody could forget - it does not exist as far as the
// connection is concerned. docs/specs/03-data-model.md §"The shared-organisation read in
// the rebuild".

export type PersonEntry = Person & {
  // doc 04's `Organizácia` and `Roly` columns, which are two axes over the same membership
  // rows and never one cell. null where the person holds no membership the session can
  // read, which is a gap and not an empty list.
  organizations: string[] | null
  roles: OrganizationRole[] | null
}

// the left join is load-bearing: a person with no membership must still render, or the
// register hides the people only a superadmin can see. both aggregates are ordered by the
// same membership id, so element *n* of `organizations` and element *n* of `roles`
// describe the same attachment.
//
// one join chain rather than two independent ones, so this needs none of
// scoped-organizations.ts's `distinct` guarding against two joins multiplying out. the
// roles are cast to text: the aggregate then carries a type the driver already parses,
// rather than an array of an enum it would have to learn.
//
// that alignment rests on `membership_tenant_isolation` and `organization_tenant_isolation`
// keying off the *same* app_acting_organizations() set. a readable membership whose
// organisation is not readable would put a null into `organizations` beside a non-null
// role, and the two cells would describe different attachments with nothing failing.
// narrowing either policy without the other is what breaks it.
export function listPeople(tx: TenantTransaction): Promise<PersonEntry[]> {
  return tx
    .select({
      ...getTableColumns(person),
      organizations: sql<
        string[] | null
      >`array_agg(${organization.name} order by ${membership.id}) filter (where ${membership.id} is not null)`,
      roles: sql<
        OrganizationRole[] | null
      >`array_agg(${membership.role}::text order by ${membership.id}) filter (where ${membership.id} is not null)`,
    })
    .from(person)
    .leftJoin(membership, eq(membership.personId, person.id))
    .leftJoin(organization, eq(organization.id, membership.organizationId))
    .groupBy(person.id)
    .orderBy(asc(person.id))
}

// doc 05 §0 and §1: the people of the organisation whose workspace is open, which is one of
// the organisations the acting session already reads and not a wider set. `listPeople`
// above is the deployment-wide register and stays as it is.
//
// `where membership.organization_id` is a **selection and never a boundary**, the same line
// scoped-airframes.ts draws and tests/tenancy/organization-workspace.test.ts asserts:
// `membership_tenant_isolation` and `person_shared_organization_or_self` decide which rows
// the session may see at all, and this clause decides which of them the tab is looking at.
export type OrganizationPersonEntry = Person & {
  role: OrganizationRole
  isPrimaryContact: boolean
}

// one select map for both tabs, so the two reads cannot drift apart unnoticed. an inner
// join, unlike `listPeople`'s: this register is the organisation's *memberships*, and a
// person holding none is not one of them.
//
// a null e-mail is untouched by any of it. nothing here joins or filters on `email`, so a
// pilot with no e-mail lists normally and the empty cell reads as the gap it is -
// CONTEXT.md §People, and asserted in tests/tenancy/organization-workspace.test.ts.
const organizationPersonEntry = {
  ...getTableColumns(person),
  role: membership.role,
  isPrimaryContact: membership.isPrimaryContact,
}

function listMembers(
  tx: TenantTransaction,
  organizationId: number,
  role: SQL,
): Promise<OrganizationPersonEntry[]> {
  return tx
    .select(organizationPersonEntry)
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(and(eq(membership.organizationId, organizationId), role))
    .orderBy(asc(person.id))
}

// tab 0, the accountable-person register. every membership whose role is not `pilot`, so
// `viewer` and `operations` land here beside `accountable_manager` - the disjoint reading
// of doc 05, marked *(inferred)* in §"The workspace in the rebuild".
export function listOrganizationPeople(
  tx: TenantTransaction,
  organizationId: number,
): Promise<OrganizationPersonEntry[]> {
  return listMembers(tx, organizationId, ne(membership.role, 'pilot'))
}

// tab 1, the pilot roster. `membership.role` is not null, so this predicate and the one
// above partition the organisation's memberships by construction: together they cover every
// one of them and neither lists a person the other does.
export function listOrganizationPilots(
  tx: TenantTransaction,
  organizationId: number,
): Promise<OrganizationPersonEntry[]> {
  return listMembers(tx, organizationId, eq(membership.role, 'pilot'))
}

// a person outside the acting session's organisations yields no rows, so the caller
// renders not-found. refusing would confirm the record is real, which is exactly what the
// boundary is for.
export async function findPerson(tx: TenantTransaction, id: number): Promise<Person | null> {
  const [row] = await tx.select().from(person).where(eq(person.id, id)).limit(1)
  return row ?? null
}
