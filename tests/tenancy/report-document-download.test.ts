import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { FIXTURE_STORAGE_ROOT, seedFixtures, type SeededIds } from '../support/fixtures'

// the report's three download paths over a real Postgres and the real policies - doc 06
// §"The documents panel in the rebuild" and docs/specs/03-data-model.md §"Serving a stored
// file in the rebuild".
// this is the slice's tier-3 surface: every other read the panel makes resolves an id against
// rows already in hand, and these three take one out of the url.
//
// **three paths asserted three times and never one standing for three.** that is the lesson
// #75 records: a guard was dropped from one of two readers with the whole suite green,
// because two of them having been written alike was being treated as coverage.
//
// remove `withTenant` from src/lib/routes/stored-file.ts and the cross-tenant case on all
// three goes red.

const { wiring } = vi.hoisted(() => ({
  wiring: { db: null as unknown, session: null as unknown },
}))

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  get db() {
    return wiring.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  actingSession: async () => wiring.session,
}))

const documentsRoute = await import('@/app/organization-reports/[org]/documents/[id]/download/route')
const formsRoute = await import('@/app/organization-reports/[org]/forms/[id]/download/route')
const permitsRoute = await import('@/app/organization-reports/[org]/permits/[id]/download/route')

// the fixture's own stored path, restated rather than imported: if the seed moves, this file
// should fail rather than follow it
const ALPHA_PERMIT = 'permits/placeholder-alpha-permit.pdf'

let harness: TestDatabase
let ids: SeededIds
let permitBytes: Uint8Array

beforeAll(async () => {
  process.env.FILE_STORAGE_ROOT = FIXTURE_STORAGE_ROOT

  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
  wiring.db = harness.app

  // a plain view over the fixture's bytes: node hands back a Buffer and the response carries
  // a Uint8Array, and the two are not deeply equal even holding the same bytes
  permitBytes = new Uint8Array(await readFile(join(FIXTURE_STORAGE_ROOT, ALPHA_PERMIT)))
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const memberOf = (personId: number): TenantSession => ({ personId, systemRole: 'member' })
const superadmin = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

// one request to a download path: the acting session, the organisation the path addresses,
// and the row id it names
const routes = [
  { path: '/organization-reports/{org}/documents/{id}/download', GET: documentsRoute.GET },
  { path: '/organization-reports/{org}/forms/{id}/download', GET: formsRoute.GET },
  { path: '/organization-reports/{org}/permits/{id}/download', GET: permitsRoute.GET },
] as const

async function download(
  route: (typeof routes)[number],
  session: TenantSession | null,
  org: number,
  id: number | string,
): Promise<Response> {
  wiring.session = session
  const url = route.path.replace('{org}', String(org)).replace('{id}', String(id))
  return route.GET(new Request(`http://localhost${url}`), {
    params: Promise.resolve({ org: String(org), id: String(id) }),
  })
}

describe.each(routes)('$path', (route) => {
  it('serves the acting tenant its own bytes, under the two response guards', async () => {
    const served = await download(
      route,
      memberOf(ids.people.alphaManager),
      ids.organizations.alpha,
      ids.documents.alphaPermit,
    )

    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(permitBytes)
    expect(served.headers.get('content-type')).toBe('application/pdf')

    // an extension allow-list is only advisory until the browser is told to stop sniffing
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')

    // a shared cache holding one of these would hand one operator's bytes to another's request
    expect(served.headers.get('cache-control')).toBe('private')
  })

  it('reads another operator document id as absent, and never as forbidden', async () => {
    // the boundary is `document_tenant_isolation` and nothing in the path: refusing would
    // confirm the document is real, which is exactly what the boundary is for
    const refused = await download(
      route,
      memberOf(ids.people.bravoManager),
      ids.organizations.alpha,
      ids.documents.alphaPermit,
    )

    expect(refused.status).toBe(404)
    expect(refused.status).not.toBe(403)
  })

  it('reads it as absent with the path naming the reader own organisation', async () => {
    // the `{org}` segment is the report's address and is not read by the handler, so it is
    // not a way around the policy either - the answer is the one above
    const refused = await download(
      route,
      memberOf(ids.people.bravoManager),
      ids.organizations.bravo,
      ids.documents.alphaPermit,
    )

    expect(refused.status).toBe(404)
  })

  it('serves the same id to a superadmin, so the absence above is the policy', async () => {
    // without this the 404 could be an empty read - a row nobody can reach, or a file the
    // disk does not have, would answer identically
    const served = await download(
      route,
      superadmin(),
      ids.organizations.alpha,
      ids.documents.alphaPermit,
    )

    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(permitBytes)
  })

  it('reads a row id nothing carries as absent', async () => {
    const refused = await download(route, superadmin(), ids.organizations.alpha, 999_999)

    expect(refused.status).toBe(404)
  })

  it('reads an id that is not one as absent, before any read is issued', async () => {
    const refused = await download(route, superadmin(), ids.organizations.alpha, '1e3')

    expect(refused.status).toBe(404)
  })

  it('answers a session that no longer resolves to a person as absent', async () => {
    // src/middleware.ts does not cover this path and reads the presence of a cookie and no
    // more, so the refusal is a resolved session or nothing
    const refused = await download(route, null, ids.organizations.alpha, ids.documents.alphaPermit)

    expect(refused.status).toBe(404)
  })
})

describe('the bucket in the path is the oracle address and not a filter', () => {
  it('serves one permit through all three paths, which is the cost doc 06 records', async () => {
    // stated rather than hidden. a reader selecting on the path's category would answer the
    // cross-tenant case above on its own, and every one of those assertions would then pass
    // with `document_tenant_isolation` dropped - which is the property that matters here.
    const statuses = await Promise.all(
      routes.map(async (route) =>
        (
          await download(
            route,
            memberOf(ids.people.alphaManager),
            ids.organizations.alpha,
            ids.documents.alphaPermit,
          )
        ).status,
      ),
    )

    expect(statuses).toEqual([200, 200, 200])
  })
})
