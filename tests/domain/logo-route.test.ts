import { beforeEach, describe, expect, it, vi } from 'vitest'

// three mocks, each load-bearing rather than convenient. what this file asserts is the
// handler's own wiring - that nothing is read before a session resolves, that the read
// happens inside withTenant under that session, and what a served response carries. the
// read itself needs a real database and a real policy, and is asserted against both in
// tests/tenancy/file-serving-isolation.test.ts.
const { actingSession, readOrganizationLogo, withTenant } = vi.hoisted(() => ({
  actingSession: vi.fn(),
  readOrganizationLogo: vi.fn(),
  withTenant: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ actingSession }))
vi.mock('@/lib/files/organization-logo', () => ({ readOrganizationLogo }))
vi.mock('@/lib/tenant/tenant-context', () => ({ withTenant }))

const { GET } = await import('@/app/api/organizations/[id]/logo/route')

const request = new Request('http://localhost/api/organizations/1/logo')
const call = (id: string) => GET(request, { params: Promise.resolve({ id }) })

const session = { personId: 7, systemRole: 'member' } as const
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

beforeEach(() => {
  vi.clearAllMocks()
  withTenant.mockImplementation((_db, _session, run: (tx: unknown) => unknown) => run({}))
})

describe('the organisation logo route refuses before it reads', () => {
  it('answers an anonymous request with not-found, not a redirect and not a refusal', async () => {
    // src/middleware.ts does not cover /api and only ever saw a cookie anyway. this is the
    // boundary, and it answers exactly what a cross-tenant id answers
    actingSession.mockResolvedValue(null)

    const response = await call('1')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBeNull()
    expect(withTenant).not.toHaveBeenCalled()
  })

  it.each(['abc', '1e3', ' 1', '-1', '1.0', '', '3000000000'])(
    'answers `%s`, which is not an organisation id, without opening a transaction',
    async (id) => {
      // a session resolves, so a 404 here can only be the identifier check. `1e3` and ` 1 `
      // are what Number() alone would have accepted, and ten digits is past int4 - which
      // raises out of range inside the query rather than answering
      actingSession.mockResolvedValue(session)

      const response = await call(id)
      expect(response.status).toBe(404)
      expect(withTenant).not.toHaveBeenCalled()
    },
  )

  it('answers the same not-found when the read came back with nothing', async () => {
    // a cross-tenant id, an organisation with no logo and a file the disk does not have all
    // arrive here as one null, and leave as one response
    actingSession.mockResolvedValue(session)
    readOrganizationLogo.mockResolvedValue(null)

    const response = await call('4')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBeNull()
  })
})

describe('the organisation logo route serves what the scoped read returned', () => {
  beforeEach(() => {
    actingSession.mockResolvedValue(session)
    readOrganizationLogo.mockResolvedValue({ bytes, contentType: 'image/png' })
  })

  it('reads inside a tenant transaction, under the session it resolved', async () => {
    await call('42')

    expect(withTenant).toHaveBeenCalledWith(expect.anything(), session, expect.any(Function))
    // and by the id as a number, not as the string the url carried
    expect(readOrganizationLogo).toHaveBeenCalledWith({}, 42)
  })

  it('carries the allow-listed content type and the bytes the read returned', async () => {
    const response = await call('42')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('makes that content type binding, because the allow-list never read the bytes', async () => {
    // the extension said png; nothing checked that the contents are one. without nosniff a
    // browser may sniff past the type and run markup in this origin, with the session in
    // scope - and the buckets this route will be copied for take .doc and .pdf
    const response = await call('42')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('keeps a tenant-scoped response out of every shared cache', async () => {
    const response = await call('42')
    expect(response.headers.get('cache-control')).toBe('private')
  })
})
