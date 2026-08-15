import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// what this suite can and cannot claim is recorded once, in
// docs/rebuild/00-operating-model.md §5 "Route contract". In short: the capture was
// GET-only, so nothing here says anything about POST, PUT or DELETE; the oracle is not
// the whole route table; and the auth expectation on each entry has no subject until the
// session layer lands, so it is read but not asserted.

type OracleRoute = { path: string; methods: string[]; auth: string }
type Oracle = { absent: { paths: string[] }; routes: OracleRoute[] }

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const oracle: Oracle = JSON.parse(
  readFileSync(join(repoRoot, 'contracts/routes.json'), 'utf8'),
)

// one page.tsx is one GET route. [id] is the oracle's {id}; a (group) segment carries no
// url of its own.
function servedPaths(dir: string, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('(') ? '' : `/${entry.name.replace(/^\[(.+)\]$/, '{$1}')}`
      found.push(...servedPaths(join(dir, entry.name), prefix + segment))
    } else if (entry.name === 'page.tsx') {
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
