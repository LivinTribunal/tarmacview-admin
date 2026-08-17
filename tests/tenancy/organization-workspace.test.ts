import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import OrganizationWorkspacePage from '@/app/admin/organizations/[org]/edit/page'
import { device, membership, organization, person } from '@/lib/db/schema'
import { t } from '@/lib/i18n'
import { listAirframes, listOrganizationAirframes } from '@/lib/tenant/scoped-airframes'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the organisation workspace over a real Postgres and the real policies, rendered through
// the page itself rather than through a stand-in for it - the not-found this slice's one
// security property turns on is the page's own branch, so a test of the read alone would
// not reach it. tests/tenancy/airframe-isolation.test.ts proves the policies; this proves
// the page does not reach past them, and that its organisation filter is a **selection**
// and not the boundary.

const NOT_FOUND = 'placeholder-not-found'

// the page's own dependencies, replaced with the harness. `db` is a module singleton built
// from DATABASE_URL, and `actingSession()` wants a request; neither is the subject here.
// what is *not* replaced is the tenant transaction, the policies or the reads.
const { wiring } = vi.hoisted(() => ({
  wiring: { db: null as unknown, session: null as unknown },
}))

// a partial mock: `createDatabase` stays the real one, because tests/support/database.ts
// is what builds the harness connection this then hands back as `db`.
vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  get db() {
    return wiring.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  actingSession: async () => wiring.session,
}))

// both of these unwind the render by throwing, which is what makes them assertable. the
// claim below is that the page *calls* not-found - never that it renders a refusal, and
// never that it redirects.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error(NOT_FOUND)
  },
  redirect: (to: string) => {
    throw new Error(`placeholder-redirect:${to}`)
  },
}))

const UAS_TAB = '2'

let harness: TestDatabase
let ids: SeededIds

// a second operator and a person attached to both it and alpha, built inside this file for
// the reason tests/tenancy/people-register-isolation.test.ts builds its shared pilot: a
// second organisation in tests/support/fixtures.ts changes what every other suite counts,
// and this pairing is this file's subject rather than a property of the fixture set.
let delta: number
let multiOperator: number

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
  wiring.db = harness.app

  const [second] = await harness.owner
    .insert(organization)
    .values({ name: 'Operator Delta', reportToken: 'report-token-delta' })
    .returning({ id: organization.id })
  const [both] = await harness.owner
    .insert(person)
    .values({ name: 'Multi Operator Person', email: null })
    .returning({ id: person.id })
  if (!second || !both) throw new Error('fixture row was not inserted')
  delta = second.id
  multiOperator = both.id

  await harness.owner
    .insert(device)
    .values({ organizationId: delta, serialNumber: 'SN-DELTA-0001' })
  await harness.owner.insert(membership).values([
    { personId: multiOperator, organizationId: ids.organizations.alpha, role: 'operations' },
    { personId: multiOperator, organizationId: delta, role: 'operations' },
  ])
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const memberOf = (personId: number): TenantSession => ({ personId, systemRole: 'member' })
const superadmin = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

// one request to the workspace: the acting session, the organisation in the path, and the
// tab in the query - `?activeRelationManager={n}`, exactly as the oracle records it.
async function open(session: TenantSession, org: number, tab?: string): Promise<string> {
  wiring.session = session
  return renderToStaticMarkup(
    await OrganizationWorkspacePage({
      params: Promise.resolve({ org: String(org) }),
      searchParams: Promise.resolve(tab === undefined ? {} : { activeRelationManager: tab }),
    }),
  )
}

describe('the UAS tab of an organisation the session belongs to', () => {
  it('lists that organisation fleet', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, UAS_TAB)

    expect(markup).toContain('Operator Alpha')
    expect(markup).toContain('SN-ALPHA-0001')
    expect(markup).toContain('SN-ALPHA-0002')
  })

  it('lists no other operator airframes', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, UAS_TAB)
    expect(markup).not.toContain('SN-BRAVO')
  })

  it('names the type of a typed airframe and states the gap on an untyped one', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, UAS_TAB)

    // SN-ALPHA-0002 has no device type, so it has no VLOS limit and no service interval.
    // the cell says so; the blank marker would read as an unfilled field and so as a pass.
    expect(markup).toContain('Placeholder Quadcopter')
    expect(markup).toContain(t('device.type.unassigned'))
  })

  it('shows the other operator their own, which is the half that makes the first mean something', async () => {
    const markup = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo, UAS_TAB)

    expect(markup).toContain('SN-BRAVO-0001')
    expect(markup).not.toContain('SN-ALPHA')
  })

  it('shows a superadmin each operator fleet at its own address, so the exclusions above are not an empty database', async () => {
    expect(await open(superadmin(), ids.organizations.alpha, UAS_TAB)).toContain('SN-ALPHA-0001')

    const bravo = await open(superadmin(), ids.organizations.bravo, UAS_TAB)
    expect(bravo).toContain('SN-BRAVO-0001')
    expect(bravo).not.toContain('SN-ALPHA')
  })
})

// the claim src/lib/tenant/scoped-airframes.ts makes about its one WHERE clause, settled
// rather than asserted in a comment. it is the difference between a wrong screen and a
// breach, and it is the claim a future reader will doubt.
describe('the organisation filter is a selection and the policy is the boundary', () => {
  it('narrows to the organisation being looked at', async () => {
    const rows = await withTenant(harness.app, memberOf(multiOperator), (tx) =>
      listOrganizationAirframes(tx, ids.organizations.alpha),
    )
    expect(rows.map((row) => row.serialNumber).sort()).toEqual(['SN-ALPHA-0001', 'SN-ALPHA-0002'])
  })

  it('without it, reaches the session own airframes across their organisations and no further', async () => {
    // `listAirframes` is the same read with the filter dropped. what comes back is wider
    // than the screen asked for and still inside the boundary - which is what separates a
    // selection from a boundary, and why removing this clause is a bug and not a breach.
    const rows = await withTenant(harness.app, memberOf(multiOperator), listAirframes)

    expect(rows.map((row) => row.serialNumber).sort()).toEqual([
      'SN-ALPHA-0001',
      'SN-ALPHA-0002',
      'SN-DELTA-0001',
    ])
  })
})

describe('an organisation the session holds no membership of', () => {
  it('is not-found for a member, because the read returns no row to render', async () => {
    // not a refusal: a forbidden response would confirm the organisation is real
    await expect(
      open(memberOf(ids.people.alphaManager), ids.organizations.bravo, UAS_TAB),
    ).rejects.toThrow(NOT_FOUND)
  })

  it('is not-found for a person attached to nothing at all', async () => {
    await expect(
      open(memberOf(ids.people.systemAdmin), ids.organizations.alpha, UAS_TAB),
    ).rejects.toThrow(NOT_FOUND)
  })

  it('opens for a superadmin, who reaches every organisation', async () => {
    expect(await open(superadmin(), ids.organizations.bravo, UAS_TAB)).toContain('Operator Bravo')
  })

  it('is not-found for an organisation id nothing carries', async () => {
    await expect(open(superadmin(), 999_999, UAS_TAB)).rejects.toThrow(NOT_FOUND)
  })
})

describe('which tab the request opened', () => {
  it('renders the first tab when no tab is named, and runs no fleet query for it', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    // tab 0 declares no sub-register, so nothing was read: the absence of every serial is
    // the evidence that only the active tab's query runs
    expect(markup).toContain(t('organization.workspace.tab.people'))
    expect(markup).not.toContain('SN-')
  })

  it('renders every tab label, so the six unbuilt ones are addressable', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, UAS_TAB)

    expect(markup).toContain(t('organization.workspace.tab.uas'))
    expect(markup).toContain(t('document.category.permits'))
    expect(markup).toContain('?activeRelationManager=6')
  })

  it('is not-found for a tab index past the last one', async () => {
    await expect(
      open(memberOf(ids.people.alphaManager), ids.organizations.alpha, '7'),
    ).rejects.toThrow(NOT_FOUND)
  })
})
