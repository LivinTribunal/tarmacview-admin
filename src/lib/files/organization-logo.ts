import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { resolveStoredFile, type StoredFile } from '@/lib/files/storage'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// PNG, JPG and WebP - docs/specs/04-admin-resources.md §OrganizationResource states them
// for the logo field. decided from the stored extension against this list and never off
// anything a request carries: a chosen content type turns a stored file into script.
const contentTypes: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

// the logo of one organisation, read the way every other scoped read is: the row first,
// inside the tenant transaction. another operator's id finds no row, so this answers null
// and the handler renders not-found - the file inherits the row's row-level security
// without either of them knowing about the other.
//
// every gap is the same null, and the caller cannot tell them apart: no row, no stored
// path, a path that escapes the storage root, an extension nothing serves, or no file on
// the disk. the extension is checked before the filesystem is touched, so a poisoned path
// with a name nothing serves never becomes a read.
export async function readOrganizationLogo(
  tx: TenantTransaction,
  id: number,
): Promise<StoredFile | null> {
  const found = await findOrganization(tx, id)
  if (!found?.logoPath) return null

  const contentType = contentTypes[extname(found.logoPath).toLowerCase()]
  if (!contentType) return null

  const file = resolveStoredFile(found.logoPath)
  if (file === null) return null

  try {
    return { bytes: await readFile(file), contentType }
  } catch {
    // a row naming a file the disk does not have is a gap, not a crash
    return null
  }
}
