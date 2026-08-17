import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { document, organization } from '@/lib/db/schema'
import { readDocumentFile } from '@/lib/files/document'
import { readOrganizationLogo } from '@/lib/files/organization-logo'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { FIXTURE_STORAGE_ROOT, seedFixtures, type SeededIds } from '../support/fixtures'

// the file-serving boundary - docs/specs/03-data-model.md §"Serving a stored file in the
// rebuild". the claim is that a stored file is reached only through the owning row, so it
// is asserted the way every other scoped read here is: a real database, a real
// TenantSession, and no request anywhere. the route handler over it is thin by design, and
// its own wiring - session, transaction, response - is tests/domain/logo-route.test.ts.
//
// the second half poisons `logo_path` with values no caller can produce today. that is the
// point of it: the column is not user input now, but the history migration (#14) imports
// these values from the predecessor, and a poisoned one must not reach outside the root.
// each of those cases points at a file that genuinely exists and is genuinely readable, or
// a null answer would only be proving the file was missing.

// the fixture's own stored paths, restated rather than imported: if a seed value moves,
// this file should fail rather than follow it.
const ALPHA_LOGO = 'organization-logos/alpha.png'
const GLOBAL_MANUAL = 'general-documents/placeholder-operations-manual.pdf'
const ALPHA_PERMIT = 'permits/placeholder-alpha-permit.pdf'

// the one extension the two allow-lists still disagree about. `.png` was that extension until
// #75 gave the document route the union of the four buckets' lists, and doc 03 §Document puts
// `.png` on the permits bucket - so the claim that the lists are two lists needs the type no
// document bucket was ever seen to take.
const LOGO_WEBP = 'organization-logos/placeholder-mark.webp'

let harness: TestDatabase
let ids: SeededIds
let logoBytes: Uint8Array
let manualBytes: Uint8Array
let permitBytes: Uint8Array
let outsideRoot: string
let outsideFile: string

beforeAll(async () => {
  process.env.FILE_STORAGE_ROOT = FIXTURE_STORAGE_ROOT

  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)

  logoBytes = await readFile(join(FIXTURE_STORAGE_ROOT, ALPHA_LOGO))
  manualBytes = await readFile(join(FIXTURE_STORAGE_ROOT, GLOBAL_MANUAL))
  permitBytes = await readFile(join(FIXTURE_STORAGE_ROOT, ALPHA_PERMIT))

  // the same bytes, one directory tree away from the storage root. a temporary directory
  // and not a second committed file: what matters is only that it is outside and readable.
  outsideRoot = await mkdtemp(join(tmpdir(), 'tarmacview-storage-'))
  outsideFile = join(outsideRoot, 'escaped.png')
  await writeFile(outsideFile, logoBytes)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
  if (outsideRoot) await rm(outsideRoot, { recursive: true, force: true })
})

const alphaSession = (): TenantSession => ({
  personId: ids.people.alphaManager,
  systemRole: 'member',
})
const bravoSession = (): TenantSession => ({
  personId: ids.people.bravoManager,
  systemRole: 'member',
})
const superadminSession = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

const readLogo = (session: TenantSession, id: number) =>
  withTenant(harness.app, session, (tx) => readOrganizationLogo(tx, id))

// stands the poisoned value in the column for the length of one assertion and puts the
// fixture's own back, so the reads either side of it stay the fixture's
async function withStoredPath<T>(storedPath: string, run: () => Promise<T>): Promise<T> {
  const set = (value: string) =>
    withTenant(harness.app, superadminSession(), (tx) =>
      tx
        .update(organization)
        .set({ logoPath: value })
        .where(eq(organization.id, ids.organizations.alpha)),
    )

  await set(storedPath)
  try {
    return await run()
  } finally {
    await set(ALPHA_LOGO)
  }
}

describe('tenant isolation: the file is reached through the row that owns it', () => {
  it('serves the acting tenant its own logo, bytes and content type', async () => {
    const logo = await readLogo(alphaSession(), ids.organizations.alpha)
    expect(logo?.contentType).toBe('image/png')
    expect(logo?.bytes).toEqual(logoBytes)

    // and the file it is equal to is a real png, or the line above is only equal to itself
    expect(Array.from(logoBytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('answers another operator with not-found rather than with a refusal', async () => {
    // the same null findOrganization already gives a cross-tenant id. no 403, because a
    // refusal confirms the row is real - and the file inherits that without knowing it
    const logo = await readLogo(bravoSession(), ids.organizations.alpha)
    expect(logo).toBeNull()
  })

  it('serves a superadmin the same file, so the exclusion above is the policy and not an empty read', async () => {
    const logo = await readLogo(superadminSession(), ids.organizations.alpha)
    expect(logo?.bytes).toEqual(logoBytes)
  })

  it('answers an organisation with no stored path, which is the normal case for the column', async () => {
    // `logo_path` is nullable and most rows have none. a gap, never a crash
    const logo = await readLogo(bravoSession(), ids.organizations.bravo)
    expect(logo).toBeNull()
  })

  it('answers an id no organisation has at all', async () => {
    const logo = await readLogo(superadminSession(), 987654)
    expect(logo).toBeNull()
  })
})

describe('what the stored path itself is not allowed to do', () => {
  it('refuses a stored path outside the storage root, on a file that is there and readable', async () => {
    // readable, so the null below is the containment check and not a missing file. an
    // absolute path is the escape that needs no `..` at all; which shapes escape is
    // arithmetic, and tests/domain/stored-file-containment.test.ts has the rest of them.
    // what this one adds is that the check is reached at all on the way to the disk.
    expect(await readFile(outsideFile)).toEqual(logoBytes)

    const logo = await withStoredPath(outsideFile, () =>
      readLogo(alphaSession(), ids.organizations.alpha),
    )
    expect(logo).toBeNull()
  })

  it('refuses an extension nothing serves, on a file that is there and readable', async () => {
    // tests/support/storage/organization-logos/not-served.svg exists precisely so this
    // reads as the allow-list refusing and not as the disk coming up empty. an svg served
    // as an svg is script running on this application's origin.
    const svg = 'organization-logos/not-served.svg'
    expect(await readFile(join(FIXTURE_STORAGE_ROOT, svg), 'utf8')).toContain('<svg')

    const logo = await withStoredPath(svg, () => readLogo(alphaSession(), ids.organizations.alpha))
    expect(logo).toBeNull()
  })

  it('answers a stored path naming a file the disk does not have', async () => {
    const logo = await withStoredPath('organization-logos/absent.png', () =>
      readLogo(alphaSession(), ids.organizations.alpha),
    )
    expect(logo).toBeNull()
  })

  it('serves a webp, which is on this list and on no document bucket', async () => {
    // the positive half of *the two allow-lists are two lists*. without it the refusal in
    // the document block below would be satisfied by a reader that serves nothing at all.
    const logo = await withStoredPath(LOGO_WEBP, () =>
      readLogo(alphaSession(), ids.organizations.alpha),
    )
    expect(logo?.contentType).toBe('image/webp')
    expect(Array.from(logo?.bytes.subarray(0, 4) ?? [])).toEqual([0x52, 0x49, 0x46, 0x46])
  })

  it('left the fixture as it found it, or every read above this line is suspect', async () => {
    const logo = await readLogo(alphaSession(), ids.organizations.alpha)
    expect(logo?.bytes).toEqual(logoBytes)
  })
})

// the second consumer of the same boundary, and the one doc 03 §"Serving a stored file in
// the rebuild" wrote the nosniff paragraph for. it now reads **every bucket** of `document`
// and not only the global library - #75, recorded in that section - so what changes between
// one row and the next is only which sessions the policy answers for. what does not change
// is that the row is resolved first, inside the tenant transaction.
//
// the containment *arithmetic* is not repeated here - tests/domain/stored-file-containment.test.ts
// covers which shapes escape. this reader's own call to resolveStoredFile is, and was not
// before #75: the logo's case proves the check is on the logo's path to the disk and says
// nothing about this one, and the two readers having been written alike is not an assertion.
// it matters more now than it did, because this route reaches tenant-owned rows whose
// `file_path` the history migration (#14) imports from the predecessor's database.

const readDocument = (session: TenantSession, id: number) =>
  withTenant(harness.app, session, (tx) => readDocumentFile(tx, id))

// only a superadmin may write a global row at all, so the poison and its removal both go
// through one - which is the policy under test in tests/tenancy/document-isolation.test.ts
// doing its job here as a side effect
async function withDocumentPath<T>(storedPath: string, run: () => Promise<T>): Promise<T> {
  const set = (value: string) =>
    withTenant(harness.app, superadminSession(), (tx) =>
      tx
        .update(document)
        .set({ filePath: value })
        .where(eq(document.id, ids.documents.globalManual)),
    )

  await set(storedPath)
  try {
    return await run()
  } finally {
    await set(GLOBAL_MANUAL)
  }
}

describe('one route, every bucket: the row is what decides which session it answers', () => {
  it('serves a member the bytes of a global document, and its allow-listed content type', async () => {
    const file = await readDocument(alphaSession(), ids.documents.globalManual)
    expect(file?.contentType).toBe('application/pdf')
    expect(file?.bytes).toEqual(manualBytes)

    // and the file it is equal to is a real pdf, or the line above is only equal to itself
    expect(Array.from(manualBytes.subarray(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46])
  })

  it('serves the other operator the same bytes, which is the whole of what a global document is', async () => {
    // no membership connects bravo to this row and there is no organisation on it to
    // connect to. the null branch of `USING` is the only reason this read returns anything
    const file = await readDocument(bravoSession(), ids.documents.globalManual)
    expect(file?.bytes).toEqual(manualBytes)
  })

  it('serves the operator their own permit, which is the bucket #75 stopped refusing', async () => {
    // this route answered null for a permit before #75, on the reading that a bucket reached
    // through the wrong route was the generic file route doc 03 refuses to have. what that
    // section actually forbids is a handler taking a path from the request, and this one
    // still takes an id and reads the path as a column - so the bucket filter came off and
    // the policy is what scopes the read, as it always was.
    const file = await readDocument(alphaSession(), ids.documents.alphaPermit)
    expect(file?.contentType).toBe('application/pdf')
    expect(file?.bytes).toEqual(permitBytes)

    // a different file from the global manual, or this would pass on the wrong bytes
    expect(permitBytes).not.toEqual(manualBytes)
    expect(Array.from(permitBytes.subarray(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46])
  })

  it('answers another operator with not-found, on the same permit and the same file', async () => {
    // the boundary, and the one the dropped bucket filter never carried: bravo holds no
    // membership of alpha, so the read returns no row and the bytes on disk are unreachable.
    // one row and two sessions, so the null is the policy rather than a missing file.
    const file = await readDocument(bravoSession(), ids.documents.alphaPermit)
    expect(file).toBeNull()
  })

  it('serves a superadmin that same permit, so the exclusion above is not an empty read', async () => {
    const file = await readDocument(superadminSession(), ids.documents.alphaPermit)
    expect(file?.bytes).toEqual(permitBytes)
  })

  it('answers an id no document has at all', async () => {
    const file = await readDocument(superadminSession(), 987654)
    expect(file).toBeNull()
  })

  it('answers a stored path naming a file the disk does not have', async () => {
    // the fixture that names a `.docx` nothing wrote. a gap, not a crash
    const file = await readDocument(alphaSession(), ids.documents.globalForm)
    expect(file).toBeNull()
  })

  it('refuses a stored path outside the storage root, on a file that is there and readable', async () => {
    // readable, so the null is this reader's containment check and not a missing file. the
    // escape is a `.png`, which the union above now serves - so the allow-list does not
    // refuse it first and the check is genuinely what answers. before #75 an out-of-root
    // `.png` was refused by the extension, and a test here could not have told the two apart.
    expect(await readFile(outsideFile)).toEqual(logoBytes)

    const file = await withDocumentPath(outsideFile, () =>
      readDocument(alphaSession(), ids.documents.globalManual),
    )
    expect(file).toBeNull()
  })

  it('refuses an extension the logo route serves and this one does not, on a file that is there', async () => {
    // the two allow-lists are still two lists, and this is what says so. it was a `.png`
    // until #75, and a png is now on both: doc 03 §Document gives the permits bucket
    // `.jpg,.jpeg,.png`, and this reader takes the union of the four buckets. `.webp` is what
    // is left - the logo route serves it above, no document bucket was ever seen to take one,
    // and copying the logo's map onto this reader is what only this case notices.
    expect(await readFile(join(FIXTURE_STORAGE_ROOT, LOGO_WEBP))).toHaveLength(34)

    const file = await withDocumentPath(LOGO_WEBP, () =>
      readDocument(alphaSession(), ids.documents.globalManual),
    )
    expect(file).toBeNull()
  })

  it('serves the png the permits bucket accepts, which is the half of the union that is new', async () => {
    // doc 03 §Document: permits take `.pdf,.jpg,.jpeg,.png,.doc,.docx`. the union is a
    // deliberate widening of what this reader serves and not an accident, so it is asserted
    // rather than left to be discovered by a permit that will not open.
    const file = await withDocumentPath(ALPHA_LOGO, () =>
      readDocument(alphaSession(), ids.documents.globalManual),
    )
    expect(file?.contentType).toBe('image/png')
    expect(file?.bytes).toEqual(logoBytes)
  })

  it('left the library as it found it, or the read above this line is suspect', async () => {
    const file = await readDocument(alphaSession(), ids.documents.globalManual)
    expect(file?.bytes).toEqual(manualBytes)
  })
})
