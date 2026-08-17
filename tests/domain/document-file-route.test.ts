import { beforeEach, describe, expect, it, vi } from 'vitest'

// the same three mocks tests/domain/logo-route.test.ts carries, and for the same reason:
// what this file asserts is the handler's own wiring - that nothing is read before a
// session resolves, that the read happens inside withTenant under that session, and what a
// served response carries. the read itself needs a real database and a real policy, and is
// asserted against both in tests/tenancy/file-serving-isolation.test.ts.
//
// a second route means a second copy of these claims, which is what
// docs/specs/03-data-model.md §"Serving a stored file in the rebuild" means by the document
// buckets copying the logo route. the copy is only safe while each copy is held up.
const { actingSession, readGeneralDocumentFile, withTenant } = vi.hoisted(() => ({
  actingSession: vi.fn(),
  readGeneralDocumentFile: vi.fn(),
  withTenant: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ actingSession }))
vi.mock('@/lib/files/general-document', () => ({ readGeneralDocumentFile }))
vi.mock('@/lib/tenant/tenant-context', () => ({ withTenant }))

const { GET } = await import('@/app/api/general-documents/[id]/file/route')

const request = new Request('http://localhost/api/general-documents/1/file')
const call = (id: string) => GET(request, { params: Promise.resolve({ id }) })

const session = { personId: 7, systemRole: 'member' } as const
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])

beforeEach(() => {
  vi.clearAllMocks()
  withTenant.mockImplementation((_db, _session, run: (tx: unknown) => unknown) => run({}))
})

describe('the general document file route refuses before it reads', () => {
  it('answers an anonymous request with not-found, not a redirect and not a refusal', async () => {
    // src/middleware.ts does not cover /api and only ever saw a cookie anyway. a global
    // document is readable by every *session*, and this is where that word is enforced
    actingSession.mockResolvedValue(null)

    const response = await call('1')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBeNull()
    expect(withTenant).not.toHaveBeenCalled()
  })

  it.each(['abc', '1e3', ' 1', '-1', '1.0', '', '3000000000'])(
    'answers `%s`, which is not a document id, without opening a transaction',
    async (id) => {
      actingSession.mockResolvedValue(session)

      const response = await call(id)
      expect(response.status).toBe(404)
      expect(withTenant).not.toHaveBeenCalled()
    },
  )

  it('answers the same not-found when the read came back with nothing', async () => {
    // an id in another bucket, a path that escapes the root, an extension nothing serves
    // and a file the disk does not have all arrive here as one null, and leave as one
    // response - so none of them confirms that a document exists
    actingSession.mockResolvedValue(session)
    readGeneralDocumentFile.mockResolvedValue(null)

    const response = await call('4')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBeNull()
  })
})

describe('the general document file route serves what the scoped read returned', () => {
  beforeEach(() => {
    actingSession.mockResolvedValue(session)
    readGeneralDocumentFile.mockResolvedValue({ bytes, contentType: 'application/pdf' })
  })

  it('reads inside a tenant transaction, under the session it resolved', async () => {
    await call('42')

    expect(withTenant).toHaveBeenCalledWith(expect.anything(), session, expect.any(Function))
    // and by the id as a number, not as the string the url carried
    expect(readGeneralDocumentFile).toHaveBeenCalledWith({}, 42)
  })

  it('carries the allow-listed content type and the bytes the read returned', async () => {
    const response = await call('42')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('makes that content type binding, because the allow-list never read the bytes', async () => {
    // this route's list takes `.doc` and `.pdf`, where what a browser finds by sniffing
    // past the type is livelier than under an image - doc 03 wrote the rule for this route
    // before the route existed
    const response = await call('42')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('keeps a session-scoped response out of every shared cache', async () => {
    const response = await call('42')
    expect(response.headers.get('cache-control')).toBe('private')
  })
})
