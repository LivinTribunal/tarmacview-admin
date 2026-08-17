import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import { document, person, type Document } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// there **is** a WHERE clause here, unlike scoped-airframes.ts and its four siblings, and
// it is the bucket and never the tenant. one table serves four registers
// (docs/specs/03-data-model.md §"The global document library in the rebuild"), so
// `/admin/general-documents` states which of them it is showing. what keeps another
// operator's bucket out is `document_tenant_isolation` and nothing in this file - dropping
// the category filter would widen the register to the acting session's own documents, never
// past them.

// the one place the bucket is named. the three workspace registers are doc 05's surface and
// bring their own read; when they land, this is the constant they each state their own copy
// of rather than a parameter this function grows.
const bucket = eq(document.category, 'general')

export type DocumentEntry = Document & {
  // doc 04's `Nahral`. null where the document names nobody *or* where the acting session
  // cannot read the person behind it, and both are gaps rather than passes.
  uploadedByName: string | null
}

// a left join, and it is load-bearing: a global document uploaded by nobody the session can
// read must still list. the register is the library, so hiding a row for want of a name
// would hide the document itself.
export function listGeneralDocuments(tx: TenantTransaction): Promise<DocumentEntry[]> {
  return tx
    .select({ ...getTableColumns(document), uploadedByName: person.name })
    .from(document)
    .leftJoin(person, eq(person.id, document.uploadedBy))
    .where(bucket)
    .orderBy(asc(document.id))
}

// the row behind /api/general-documents/{id}/file. an id in another bucket yields no rows
// for the reason a cross-tenant id does: the route sits under the resource that owns the
// file, and answering for a permit here would make it the generic file route
// docs/specs/03-data-model.md §"Serving a stored file in the rebuild" refuses to have.
export async function findGeneralDocument(
  tx: TenantTransaction,
  id: number,
): Promise<Document | null> {
  const [row] = await tx
    .select()
    .from(document)
    .where(and(eq(document.id, id), bucket))
    .limit(1)
  return row ?? null
}
