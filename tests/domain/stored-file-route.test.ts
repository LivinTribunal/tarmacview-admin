import { beforeEach, describe, expect, it, vi } from 'vitest'

// the three served file routes, against the one handler they now share -
// src/lib/routes/stored-file.ts, the extraction #63 asked for and #82 earned. what is
// asserted is the handler's own wiring: that nothing is read before a session resolves, that
// the read happens inside withTenant under that session, that each path reads **its own**
// table, and what a served response carries. the reads themselves need a real database and
// real policies and are asserted against both in
// tests/tenancy/file-serving-isolation.test.ts.
//
// **one file and three cases, not one case.** the handler being one function is exactly why
// each route still has to be held up separately here: #75's consolidation lost a guard on one
// of two readers with the whole suite green, because two readers having been written alike
// was being treated as coverage. it is not - so every claim below runs once per served path,
// and breaking either header kills three tests named after three routes.
//
// the mocks are the readers, the session and the transaction. the two guards that are *not*
// here are the containment check and the allow-list: those are properties of the stored path
// rather than of the response, so they live in src/lib/files/storage.ts and are killed by the
// database suite instead.
const { actingSession, readDocumentFile, readIncidentFile, readOrganizationLogo, withTenant } =
  vi.hoisted(() => ({
    actingSession: vi.fn(),
    readDocumentFile: vi.fn(),
    readIncidentFile: vi.fn(),
    readOrganizationLogo: vi.fn(),
    withTenant: vi.fn(),
  }))
vi.mock('@/lib/auth/session', () => ({ actingSession }))
vi.mock('@/lib/files/document', () => ({ readDocumentFile }))
vi.mock('@/lib/files/incident', () => ({ readIncidentFile }))
vi.mock('@/lib/files/organization-logo', () => ({ readOrganizationLogo }))
vi.mock('@/lib/tenant/tenant-context', () => ({ withTenant }))

const documentRoute = await import('@/app/api/documents/[id]/file/route')
const logoRoute = await import('@/app/api/organizations/[id]/logo/route')
const incidentRoute = await import('@/app/api/incidents/[id]/file/route')

const session = { personId: 7, systemRole: 'member' } as const

// a distinct content type and distinct bytes per route, so the assertion that a route serves
// what *its* reader returned cannot pass on another route's answer. the magic numbers are the
// real ones: `%PDF`, the PNG signature, and the OLE2 header an old binary `.doc` opens with.
const routes = [
  {
    path: '/api/documents/{id}/file',
    GET: documentRoute.GET,
    read: readDocumentFile,
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    contentType: 'application/pdf',
  },
  {
    path: '/api/organizations/{id}/logo',
    GET: logoRoute.GET,
    read: readOrganizationLogo,
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    contentType: 'image/png',
  },
  {
    path: '/api/incidents/{id}/file',
    GET: incidentRoute.GET,
    read: readIncidentFile,
    bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]),
    contentType: 'application/msword',
  },
] as const

const readers = [readDocumentFile, readIncidentFile, readOrganizationLogo]

// `1e3` and ` 1` are what Number() alone would have accepted, and ten digits is past int4 -
// which raises out of range inside the query rather than answering
const notAnId = ['abc', '1e3', ' 1', '-1', '1.0', '', '3000000000']

describe.each(routes)('$path', ({ path, GET, read, bytes, contentType }) => {
  const request = new Request(`http://localhost${path.replace('{id}', '1')}`)
  const call = (id: string) => GET(request, { params: Promise.resolve({ id }) })

  beforeEach(() => {
    vi.clearAllMocks()
    withTenant.mockImplementation((_db, _session, run: (tx: unknown) => unknown) => run({}))
  })

  describe('refuses before it reads', () => {
    it('answers an anonymous request with not-found, not a redirect and not a refusal', async () => {
      // src/middleware.ts does not cover /api and only ever saw a cookie anyway. this is the
      // boundary, and it answers exactly what a cross-tenant id answers
      actingSession.mockResolvedValue(null)

      const response = await call('1')
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toBeNull()
      expect(withTenant).not.toHaveBeenCalled()
    })

    it.each(notAnId)('answers `%s`, which is not a row id, without opening a transaction', async (id) => {
      // a session resolves, so a 404 here can only be the identifier check
      actingSession.mockResolvedValue(session)

      const response = await call(id)
      expect(response.status).toBe(404)
      expect(withTenant).not.toHaveBeenCalled()
    })

    it('answers the same not-found when the read came back with nothing', async () => {
      // another operator's row, a row naming no file, a path that escapes the storage root,
      // an extension nothing serves and a file the disk does not have all arrive here as one
      // null and leave as one response - so none of them confirms that a row exists
      actingSession.mockResolvedValue(session)
      read.mockResolvedValue(null)

      const response = await call('4')
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toBeNull()
    })
  })

  describe('serves what the scoped read returned', () => {
    beforeEach(() => {
      actingSession.mockResolvedValue(session)
      read.mockResolvedValue({ bytes, contentType })
    })

    it('reads inside a tenant transaction, under the session it resolved', async () => {
      await call('42')

      expect(withTenant).toHaveBeenCalledWith(expect.anything(), session, expect.any(Function))
      // by the id as a number, not as the string the url carried - and by nothing else, which
      // is the property one route per table turns on: the path, the extension and the bucket
      // are all columns the read resolves. `toHaveBeenCalledWith` pins the whole argument
      // list, so a third argument taken off the request fails here.
      expect(read).toHaveBeenCalledWith({}, 42)
    })

    it('reads its own table and none of the others', async () => {
      // one handler over three readers is one place to wire the wrong one, and a served
      // response alone cannot tell which table answered
      await call('42')

      for (const other of readers.filter((candidate) => candidate !== read)) {
        expect(other).not.toHaveBeenCalled()
      }
    })

    it('carries the allow-listed content type and the bytes the read returned', async () => {
      const response = await call('42')
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(contentType)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    })

    it('makes that content type binding, because the allow-list never read the bytes', async () => {
      // the extension said what it said; nothing checked the contents. without nosniff a
      // browser may sniff past the type and run markup in this origin with the session in
      // scope - and two of these three lists take `.doc` and `.pdf`, where what sniffing
      // finds is livelier than under an image.
      const response = await call('42')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    })

    it('keeps a session-scoped response out of every shared cache', async () => {
      // every byte these routes serve belongs to one resolved session, so a shared cache
      // holding one would hand one operator's file to another operator's request
      const response = await call('42')
      expect(response.headers.get('cache-control')).toBe('private')
    })
  })
})
