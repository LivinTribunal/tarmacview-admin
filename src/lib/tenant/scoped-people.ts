import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
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

// a person outside the acting session's organisations yields no rows, so the caller
// renders not-found. refusing would confirm the record is real, which is exactly what the
// boundary is for.
export async function findPerson(tx: TenantTransaction, id: number): Promise<Person | null> {
  const [row] = await tx.select().from(person).where(eq(person.id, id)).limit(1)
  return row ?? null
}
