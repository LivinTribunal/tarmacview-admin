import { isAbsolute, relative, resolve, sep } from 'node:path'

// where uploaded files live on disk - docs/specs/03-data-model.md §"Serving a stored file
// in the rebuild". nothing under here is ever served statically: a file leaves this
// directory only through a handler that has already read its owning row.

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
