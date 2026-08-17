import { readStoredFile, type StoredFile } from '@/lib/files/storage'
import { findIncident } from '@/lib/tenant/scoped-incidents'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// the third consumer of docs/specs/03-data-model.md §"Serving a stored file in the
// rebuild", and the one that earned the extraction: three copies is the threshold
// src/lib/routes/identifier.ts states for this repo, so the mechanics either side of this
// file are shared and only the row and the list below are its own.
//
// one route per *table* and this is a different table - `incident.file_path` is its own
// column and not a `document` row, because doc 03's four buckets are `general`, `forms`,
// `permits` and `operations` and an occurrence report is none of them.

// docs/specs/05-organization-workspace.md §6: `≤50 MB; PDF, DOC, DOCX, images`. the size is
// an upload rule with no upload path to enforce it (#56 deferred that); what a *read* can
// still decide is the extension, and it decides it against this list and never against
// anything a request carries.
//
// **its own list, though it agrees with the document union today** - and the two halves of it
// stand on different ground, which is worth saying rather than papering over. `.pdf`, `.doc`
// and `.docx` are doc 05 §6's own words, so they answer to that document. *images* it does
// **not** enumerate, so those three are read across from doc 03 §Document's permits bucket
// deliberately: if that list ever changes, this one is to be revisited with it rather than
// left behind.
//
// so it is written out here rather than imported for the narrower reason only - §6 is the
// source for the office types, and a correction there must not travel to the document reader.
// `.webp` is off it: it is the logo route's own type, §6 names no image type at all, and
// guessing wide on a reader that also serves office documents is the wrong way to guess.
const contentTypes: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

// the file attached to one occurrence report. another operator's id finds no row, so this
// answers null and the handler renders not-found.
//
// `file_path` is **nullable** here where `document.file_path` is not - doc 05 §6 marks the
// file optional - so this reader carries the logo's fifth gap as well: a report that names
// no file at all, which is a state and never a crash. every gap is the same null and the
// caller cannot tell them apart.
export async function readIncidentFile(
  tx: TenantTransaction,
  id: number,
): Promise<StoredFile | null> {
  const found = await findIncident(tx, id)
  if (!found?.filePath) return null

  return readStoredFile(found.filePath, contentTypes)
}
