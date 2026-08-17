import { readStoredFile, type StoredFile } from '@/lib/files/storage'
import { findDocument } from '@/lib/tenant/scoped-documents'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// the second consumer of docs/specs/03-data-model.md §"Serving a stored file in the
// rebuild", built the way that section says: the owning row first, inside the tenant
// transaction, and the bytes only if that read returned one. it serves every bucket of
// `document`, which is #75's correction and is recorded in that section.

// the **union** of what the four buckets accept, and deliberately not one list per bucket:
// doc 03 §Document gives permits `.pdf,.jpg,.jpeg,.png,.doc,.docx`, and the section above
// gives the global library `.pdf`, `.doc` and `.docx`.
//
// `.webp` stays off it. it is the logo route's own type and no document bucket was ever seen
// to take one, so the three allow-lists remain three lists rather than converging on whatever
// is easiest to serve - the property #61 asserted with a `.png` and which now has to be
// asserted with the extension this list and the logo's still disagree about.
//
// `.doc` and `.docx` are two content types and not one: an old binary Word file served as
// the OOXML type is a lie the browser acts on. none of these is ever derived from the
// request, and a default branch that refuses is the way round this has to be written.
const contentTypes: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

// one document, of whichever bucket the acting session can read. the row is what decides:
// a global one resolves for every session, an operator's own for that operator, and another
// operator's finds nothing here for exactly the reason a cross-tenant logo does.
//
// every gap is the same null and the caller cannot tell them apart: no row, a path that
// escapes the storage root, an extension nothing serves, or no file on the disk.
// `file_path` is not null on this table, so the fifth gap the logo and the occurrence
// register both have - a row naming no file at all - cannot arise here.
//
// `is_public` is not read here, and that is the point: doc 03 §"Serving a stored file in the
// rebuild" wants a public read to be an explicit opt-in on a handler whose default branch
// refuses, and this handler has no branch for it at all. every byte it serves goes to a
// resolved session.
export async function readDocumentFile(
  tx: TenantTransaction,
  id: number,
): Promise<StoredFile | null> {
  const found = await findDocument(tx, id)
  if (!found) return null

  return readStoredFile(found.filePath, contentTypes)
}
