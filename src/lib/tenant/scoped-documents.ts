import { and, asc, eq, getTableColumns, type SQL } from 'drizzle-orm'
import { document, person, type Document, type DocumentCategory } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// there **are** WHERE clauses here, unlike scoped-airframes.ts and its four siblings, and
// they are the bucket and the organisation, never the tenant. one table serves four
// registers (docs/specs/03-data-model.md §"The global document library in the rebuild"), so
// each register states which of them it is showing. what keeps another operator's bucket out
// is `document_tenant_isolation` and nothing in this file - dropping a category filter would
// widen a register to the acting session's own documents, never past them.

export type DocumentEntry = Document & {
  // doc 04's `Nahral`. null where the document names nobody *or* where the acting session
  // cannot read the person behind it, and both are gaps rather than passes.
  uploadedByName: string | null
}

// one select map for every register over this table, so the four reads cannot drift apart
// unnoticed - the shape scoped-people.ts's `listMembers` uses for its two.
//
// the left join is load-bearing: a document uploaded by nobody the session can read must
// still list. a register is its bucket, so hiding a row for want of a name would hide the
// document itself.
function listDocuments(tx: TenantTransaction, where: SQL | undefined): Promise<DocumentEntry[]> {
  return tx
    .select({ ...getTableColumns(document), uploadedByName: person.name })
    .from(document)
    .leftJoin(person, eq(person.id, document.uploadedBy))
    .where(where)
    .orderBy(asc(document.id))
}

// `/admin/general-documents`, the one bucket that is not an operator's own. no organisation
// clause, because a global document belongs to none: the null branch of `USING` is what
// admits it to every session, and it is the whole of why this register needs no second one.
export function listGeneralDocuments(tx: TenantTransaction): Promise<DocumentEntry[]> {
  return listDocuments(tx, eq(document.category, 'general'))
}

// doc 05 §3, §4 and §5 - the workspace's three buckets, which differ by the constant their
// tab states and by nothing else. one read and three callers, rather than a bucket this
// function grows a branch for.
//
// `where organization_id` is a **selection and never a boundary**, the same line
// scoped-people.ts and scoped-airframes.ts draw and
// tests/tenancy/organization-workspace.test.ts asserts: `document_tenant_isolation` decides
// which rows the session may see at all, and this clause decides which of them the tab is
// looking at. `category` beside it is not a boundary either - the four buckets partition the
// table, so what it decides is which tab a readable row appears on.
export function listOrganizationDocuments(
  tx: TenantTransaction,
  organizationId: number,
  category: DocumentCategory,
): Promise<DocumentEntry[]> {
  return listDocuments(
    tx,
    and(eq(document.organizationId, organizationId), eq(document.category, category)),
  )
}

// the row behind /api/documents/{id}/file, and it carries **no bucket filter** - the
// correction #75 makes to what this file said before it.
//
// what docs/specs/03-data-model.md §"Serving a stored file in the rebuild" forbids is a
// handler that takes a path or a filename from the request; this one takes an id, resolves
// the row inside the tenant transaction, and reads the path as a column. a route serving one
// table by row id is not the generic file route that section refuses to have - it is the
// route sitting under the resource that owns the file, and the resource is `document`, which
// doc 03 made one table on purpose so the file-serving integration would not be repeated
// per bucket.
//
// so the bucket stays with the registers above, where it decides which tab a row appears on.
// here it would only have decided which of five copies of one handler served the row, and
// what scopes this read is `document_tenant_isolation` either way: another operator's
// document yields nothing, and a global one yields to every session.
export async function findDocument(tx: TenantTransaction, id: number): Promise<Document | null> {
  const [row] = await tx.select().from(document).where(eq(document.id, id)).limit(1)
  return row ?? null
}
