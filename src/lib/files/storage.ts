import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'

// where uploaded files live on disk - docs/specs/03-data-model.md §"Serving a stored file
// in the rebuild". nothing under here is ever served statically: a file leaves this
// directory only through a handler that has already read its owning row.

// what a resource's read hands back once its own row and its own allow-list have both
// answered. it lives here rather than beside either reader, because the organisation logo,
// the document library and the occurrence register are now three of them.
export type StoredFile = { bytes: Uint8Array; contentType: string }

// configuration, because the deployment decides where the disk is and a test needs its
// own. no default: an unset variable falling back to the working directory would quietly
// make every file in the checkout a candidate. read per call rather than at import, so
// importing this during a build with no environment set is safe - the same reasoning
// src/lib/db/client.ts gives for the connection string.
export function storageRoot(): string {
  const root = process.env.FILE_STORAGE_ROOT
  if (!root) throw new Error('FILE_STORAGE_ROOT is not set')
  return resolve(root)
}

// joins a stored path onto the root and answers with an absolute path only if the result
// is still inside it, null otherwise.
//
// defence in depth, and worth saying why it exists at all: a stored path is a column and
// never a request input, so no caller can steer it today. but the history migration (#14)
// imports these values from the predecessor's database, and one poisoned row must not
// reach outside the root. an absolute stored path escapes here too - resolve() discards
// the root when handed one.
//
// the containment test is relative(), not a string prefix: a prefix test admits a sibling
// directory whose name merely starts with the root's. its ceiling is that it decides on the
// joined path and not on what a symlink inside the root points at - planting one there
// needs write access to the storage directory, which is already the whole game.
export function resolveStoredFile(storedPath: string): string | null {
  const root = storageRoot()
  const file = resolve(root, storedPath)
  const inside = relative(root, file)

  // '' is the root itself, which is a directory and not a file
  const escapes =
    inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)

  return escapes ? null : file
}

// everything the three readers do between a stored path and the bytes: two of the four
// guards §"Serving a stored file in the rebuild" names, in one place rather than one copy
// per table - #63, and #82 is the third copy that earned the extraction.
//
// the allow-list stays the **caller's**, passed in rather than merged here. the three lists
// are three lists: the logo takes `.webp` and no document bucket was ever seen to, and doc
// 05 §6 enumerates the occurrence register's own. a shared map would be the widening nobody
// decided, which is what the cross-refusal cases in
// tests/tenancy/file-serving-isolation.test.ts exist to catch.
//
// the extension is checked before the filesystem is touched, so a poisoned path with a name
// nothing serves never becomes a read. every gap answers with the same null and the caller
// cannot tell them apart: an extension nothing serves, a path that escapes the storage root,
// or no file on the disk.
export async function readStoredFile(
  storedPath: string,
  contentTypes: Readonly<Record<string, string>>,
): Promise<StoredFile | null> {
  const contentType = contentTypes[extname(storedPath).toLowerCase()]
  if (!contentType) return null

  const file = resolveStoredFile(storedPath)
  if (file === null) return null

  try {
    return { bytes: await readFile(file), contentType }
  } catch {
    // a row naming a file the disk does not have is a gap, not a crash
    return null
  }
}
