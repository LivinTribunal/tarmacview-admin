import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { document, organization } from '@/lib/db/schema'
import { readGeneralDocumentFile } from '@/lib/files/general-document'
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

let harness: TestDatabase
let ids: SeededIds
let logoBytes: Uint8Array
let manualBytes: Uint8Array
let outsideRoot: string
let outsideFile: string

beforeAll(async () => {
  process.env.FILE_STORAGE_ROOT = FIXTURE_STORAGE_ROOT

  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)

  logoBytes = await readFile(join(FIXTURE_STORAGE_ROOT, ALPHA_LOGO))
  manualBytes = await readFile(join(FIXTURE_STORAGE_ROOT, GLOBAL_MANUAL))

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

  it('left the fixture as it found it, or every read above this line is suspect', async () => {
    const logo = await readLogo(alphaSession(), ids.organizations.alpha)
    expect(logo?.bytes).toEqual(logoBytes)
  })
})

// the second consumer of the same boundary, and the one doc 03 §"Serving a stored file in
// the rebuild" wrote the nosniff paragraph for. what changes is which sessions the read
// answers for - a global document belongs to no operator and every session may read it.
// what does not change is that the row is resolved first, inside the tenant transaction.
//
// the containment cases are not repeated here: both readers reach the storage root through
// the same resolveStoredFile(), which the block above proves is on the path to the disk and
// tests/domain/stored-file-containment.test.ts covers the arithmetic of.

const readDocument = (session: TenantSession, id: number) =>
  withTenant(harness.app, session, (tx) => readGeneralDocumentFile(tx, id))

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

describe('the global library reaches its file through the row too, for every session', () => {
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

  it('answers not-found for a document in another bucket, even to the operator that owns it', async () => {
    // alpha may read its own operations manual; this route may not serve it. the route sits
    // under the resource that owns the file, and a bucket reached through the wrong one is
    // the generic file route doc 03 refuses to have
    const file = await readDocument(alphaSession(), ids.documents.alphaOperations)
    expect(file).toBeNull()
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

  it('refuses an extension the logo route serves and this one does not, on a file that is there', async () => {
    // the two allow-lists are different lists, and this is what says so: a png is readable,
    // is served under the route above, and is refused here. copy the logo's map onto this
    // reader and only this case notices.
    const file = await withDocumentPath(ALPHA_LOGO, () =>
      readDocument(alphaSession(), ids.documents.globalManual),
    )
    expect(file).toBeNull()
  })

  it('left the library as it found it, or the read above this line is suspect', async () => {
    const file = await readDocument(alphaSession(), ids.documents.globalManual)
    expect(file?.bytes).toEqual(manualBytes)
  })
})
