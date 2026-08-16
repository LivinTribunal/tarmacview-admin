import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveStoredFile, storageRoot } from '@/lib/files/storage'

// the traversal half of docs/specs/03-data-model.md §"Serving a stored file in the
// rebuild", asserted as path arithmetic: no disk and no database, because containment is
// decided before either is touched. the root here is invented and never exists - resolve()
// and relative() answer without asking the filesystem, which is the point.

const root = '/srv/tarmacview/storage'

afterEach(() => {
  delete process.env.FILE_STORAGE_ROOT
})

describe('the storage root is configuration', () => {
  it('refuses to answer at all when nothing configured one', () => {
    expect(() => storageRoot()).toThrow(/FILE_STORAGE_ROOT/)
  })

  it('resolves a relative setting against the working directory', () => {
    process.env.FILE_STORAGE_ROOT = './var/storage'
    expect(storageRoot()).toBe(`${process.cwd()}/var/storage`)
  })
})

describe('a stored path resolves under the root, or not at all', () => {
  beforeEach(() => {
    process.env.FILE_STORAGE_ROOT = root
  })

  it('joins an ordinary stored path onto the root', () => {
    expect(resolveStoredFile('organization-logos/alpha.png')).toBe(
      '/srv/tarmacview/storage/organization-logos/alpha.png',
    )
  })

  it('keeps a path that walks up and back down again, which never left', () => {
    // the check must not be so blunt that it refuses a legal path containing `..`, or the
    // first normalised value the history migration imports reads as an attack
    expect(resolveStoredFile('organization-logos/../permits/alpha.png')).toBe(
      '/srv/tarmacview/storage/permits/alpha.png',
    )
  })

  it('refuses a path that climbs out of the root', () => {
    expect(resolveStoredFile('../secrets/alpha.png')).toBeNull()
  })

  it('refuses one that climbs out through a subdirectory', () => {
    expect(resolveStoredFile('organization-logos/../../../etc/hosts.png')).toBeNull()
  })

  it('refuses an absolute stored path, which discards the root entirely', () => {
    // resolve() ignores everything to its left when the last argument is absolute, so this
    // is the escape that needs no `..` at all
    expect(resolveStoredFile('/etc/passwd')).toBeNull()
  })

  it('refuses a sibling directory whose name merely starts with the root', () => {
    // the case a `startsWith(root)` containment test admits. /srv/tarmacview/storage-backup
    // is not inside /srv/tarmacview/storage, and only relative() says so.
    expect(resolveStoredFile('../storage-backup/alpha.png')).toBeNull()
  })

  it('refuses the root itself, which is a directory and not a file', () => {
    expect(resolveStoredFile('')).toBeNull()
    expect(resolveStoredFile('.')).toBeNull()
    expect(resolveStoredFile('organization-logos/..')).toBeNull()
  })
})
