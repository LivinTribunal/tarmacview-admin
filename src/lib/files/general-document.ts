import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { resolveStoredFile, type StoredFile } from '@/lib/files/storage'
import { findGeneralDocument } from '@/lib/tenant/scoped-documents'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// the second consumer of docs/specs/03-data-model.md §"Serving a stored file in the
// rebuild", built the way that section says the document buckets copy the logo route: the
// owning row first, inside the tenant transaction, and the bytes only if that read returned
// one.

// the three the section names for the document buckets. the wider list doc 03 §Document
// records - `.jpg`, `.jpeg`, `.png` - is Observed for the **permits** bucket's upload form,
// which is its own slice, so nothing here serves an extension the global library was never
// seen to hold. a default branch that refuses is the way round this has to be written.
//
// `.doc` and `.docx` are two content types and not one: an old binary Word file served as
// the OOXML type is a lie the browser acts on. neither is ever derived from the request.
const contentTypes: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// one document of the global library. every session may read the library, so the row this
// resolves is not the acting tenant's - but it is still the row that decides, and a
// tenant-owned document belonging to another operator finds nothing here for exactly the
// reason a cross-tenant logo does.
//
// every gap is the same null and the caller cannot tell them apart: no row, an id in
// another bucket, a path that escapes the storage root, an extension nothing serves, or no
// file on the disk. `file_path` is not null on this table, so the logo's sixth gap - a row
// naming no file at all - cannot arise.
export async function readGeneralDocumentFile(
  tx: TenantTransaction,
  id: number,
): Promise<StoredFile | null> {
  const found = await findGeneralDocument(tx, id)
  if (!found) return null

  const contentType = contentTypes[extname(found.filePath).toLowerCase()]
  if (!contentType) return null

  const file = resolveStoredFile(found.filePath)
  if (file === null) return null

  try {
    return { bytes: await readFile(file), contentType }
  } catch {
    // a row naming a file the disk does not have is a gap, not a crash
    return null
  }
}
