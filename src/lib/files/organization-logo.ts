import { readStoredFile, type StoredFile } from '@/lib/files/storage'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// PNG, JPG and WebP - docs/specs/04-admin-resources.md §OrganizationResource states them
// for the logo field. decided from the stored extension against this list and never off
// anything a request carries: a chosen content type turns a stored file into script.
//
// the narrowest of the three lists, and the only one carrying `.webp`. it serves no office
// type and no pdf at all, which is what keeps a logo cell from ever rendering a document.
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
// the disk.
export async function readOrganizationLogo(
  tx: TenantTransaction,
  id: number,
): Promise<StoredFile | null> {
  const found = await findOrganization(tx, id)
  if (!found?.logoPath) return null

  return readStoredFile(found.logoPath, contentTypes)
}
