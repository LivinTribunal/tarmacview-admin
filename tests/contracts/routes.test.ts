import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { middleware, requiresSession } from '@/middleware'

// what this suite can and cannot claim is recorded once, in
// docs/rebuild/00-operating-model.md §5 "Route contract". In short: the capture was
// GET-only, so nothing here says anything about POST, PUT or DELETE, and the oracle is
// not the whole route table. The auth expectation now has a subject - the middleware -
// so it is asserted at the bottom of this file, as a property of which paths the gate
// covers rather than of any live response.

type OracleRoute = { path: string; methods: string[]; auth: string }
type Oracle = { absent: { paths: string[] }; routes: OracleRoute[] }

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const oracle: Oracle = JSON.parse(
  readFileSync(join(repoRoot, 'contracts/routes.json'), 'utf8'),
)

// one page.tsx is one GET route, and so is one route.ts - an api handler serves a path
// as surely as a page does, so the absent lock has to see both or an auth package can
// mount a sign-up endpoint the lock never notices. [id] is the oracle's {id}; a (group)
// segment carries no url of its own.
function servedPaths(dir: string, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('(') ? '' : `/${entry.name.replace(/^\[(.+)\]$/, '{$1}')}`
      found.push(...servedPaths(join(dir, entry.name), prefix + segment))
    } else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
      found.push(prefix === '' ? '/' : prefix)
    }
  }
  return found
}

const served = servedPaths(join(repoRoot, 'src/app'))

describe('route contract: device-type paths, path shapes only, GET-only capture', () => {
  const captured = oracle.routes
    .filter((route) => route.path.startsWith('/admin/device-types'))
    .map((route) => route.path)
    .sort()

  it('the oracle carries device-type paths to assert against', () => {
    expect(captured.length).toBeGreaterThan(0)
  })

  it.each(captured)('%s is served by the app router', (path) => {
    expect(served).toContain(path)
  })
})

describe('route contract: the absent lock, whole app tree', () => {
  it.each(oracle.absent.paths)('%s stays unrouted', (path) => {
    expect(served).not.toContain(path)
  })
})

// which paths the session gate covers, against the oracle's auth expectation. this is a
// property of the middleware's own predicate, not of a live response: asserting a
// redirect would need a running server, and the expectation being checked here is which
// paths are gated at all.
describe('route contract: the session gate covers the application paths, not asset paths', () => {
  const sampleId = (path: string) => path.replace(/\{[^}]+\}/g, '1')
  const byAuth = (auth: string) => oracle.routes.filter((route) => route.auth === auth)

  // the oracle also marks the predecessor's css, js and storage paths as session
  // routes. those are its framework serving its own assets from behind auth, not a
  // product decision to carry over, so the gate is asserted over the application
  // surfaces doc 09 names: /admin/*, /organization-reports/* and /.
  const application = (path: string) =>
    path === '/' || path.startsWith('/admin') || path.startsWith('/organization-reports')

  it.each(byAuth('session').map((route) => route.path).filter(application))(
    '%s needs a session',
    (path) => {
      expect(requiresSession(sampleId(path))).toBe(true)
    },
  )

  it.each(byAuth('public').map((route) => route.path))('%s stays anonymous', (path) => {
    expect(requiresSession(path)).toBe(false)
  })

  it('the auth endpoints are reachable anonymously, or nobody could ever sign in', () => {
    expect(requiresSession('/api/auth/sign-in/email')).toBe(false)
  })
})

// where the redirect lands is the rebuild's own decision, not an oracle assertion: the
// capture was a GET-only crawl of an authenticated session, so it never fetched a
// sign-in page and contracts/routes.json holds no entry for one. What is asserted here
// is internal consistency - the place the gate sends people is a place this application
// serves, and it is not itself gated.
describe('the sign-in redirect, a decision recorded in docs/specs/09-roles-permissions.md', () => {
  const turnedAway = middleware(new NextRequest('http://localhost/admin/device-types'))
  const target = new URL(turnedAway.headers.get('location') ?? '', 'http://localhost')

  it('sends an anonymous visitor to a path the app router actually serves', () => {
    expect(served).toContain(target.pathname)
  })

  it('preserves where they were going', () => {
    expect(target.searchParams.get('next')).toBe('/admin/device-types')
  })

  it('does not gate the page it redirects to, which would be a loop', () => {
    expect(requiresSession(target.pathname)).toBe(false)
  })
})
