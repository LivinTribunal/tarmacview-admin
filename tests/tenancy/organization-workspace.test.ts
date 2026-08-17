import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import OrganizationWorkspacePage from '@/app/admin/organizations/[org]/edit/page'
import { device, membership, organization, person } from '@/lib/db/schema'
import { t } from '@/lib/i18n'
import { listAirframes, listOrganizationAirframes } from '@/lib/tenant/scoped-airframes'
import {
  listOrganizationPeople,
  listOrganizationPilots,
  listPeople,
} from '@/lib/tenant/scoped-people'
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

const PEOPLE_TAB = '0'
const PILOTS_TAB = '1'
const UAS_TAB = '2'

let harness: TestDatabase
let ids: SeededIds

// a second operator and a person attached to both it and alpha, built inside this file for
// the reason tests/tenancy/people-register-isolation.test.ts builds its shared pilot: a
// second organisation in tests/support/fixtures.ts changes what every other suite counts,
// and this pairing is this file's subject rather than a property of the fixture set.
//
// the viewer is here for the same reason and settles a different claim: it is the role
// neither tab names, so a predicate that listed `accountable_manager` and `operations` by
// hand would drop it and a test of tab 0 alone would still pass.
let delta: number
let multiOperator: number
let alphaViewer: number

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
    .values({ name: 'Multi Operator Person', email: null, position: 'Placeholder Shared Post' })
    .returning({ id: person.id })
  const [viewer] = await harness.owner
    .insert(person)
    .values({ name: 'Alpha Viewer', email: 'alpha.viewer@example.invalid' })
    .returning({ id: person.id })
  if (!second || !both || !viewer) throw new Error('fixture row was not inserted')
  delta = second.id
  multiOperator = both.id
  alphaViewer = viewer.id

  await harness.owner
    .insert(device)
    .values({ organizationId: delta, serialNumber: 'SN-DELTA-0001' })
  await harness.owner.insert(membership).values([
    { personId: multiOperator, organizationId: ids.organizations.alpha, role: 'operations' },
    { personId: multiOperator, organizationId: delta, role: 'operations' },
    { personId: alphaViewer, organizationId: ids.organizations.alpha, role: 'viewer' },
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

describe('the two people tabs of an organisation the session belongs to', () => {
  it('lists the accountable people on tab 0, with their job title and their phone', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, PEOPLE_TAB)

    expect(markup).toContain('Alpha Manager')
    expect(markup).toContain('PHONE-PLACEHOLDER-0001')
    expect(markup).toContain('Placeholder Post')
    expect(markup).toContain(t('person.primaryContact.yes'))
  })

  it('lists the pilots on tab 1, and a pilot with no e-mail is one of them', async () => {
    // `person.email` is nullable and load-bearing. the row is here and the cell is blank,
    // which is the gap reading as a gap rather than the pilot vanishing from the roster.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, PILOTS_TAB)

    expect(markup).toContain('Alpha Pilot')
    expect(markup).toContain('CERT-PLACEHOLDER-0001')
    expect(markup).toContain(t('table.blank'))
  })

  it('reads no organisation with no primary contact as a gap rather than a stated no', async () => {
    // nobody under delta carries the flag, so the whole column is the blank marker. a
    // negative word in every row would state a fact `not null default false` cannot carry.
    const markup = await open(superadmin(), delta, PEOPLE_TAB)

    expect(markup).toContain('Multi Operator Person')
    expect(markup).not.toContain(t('person.primaryContact.yes'))
  })

  it('lists none of the other operator people on either tab', async () => {
    for (const tab of [PEOPLE_TAB, PILOTS_TAB]) {
      const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, tab)
      expect(markup, `tab ${tab}`).not.toContain('Bravo Manager')
    }
  })

  it('shows the other operator their own, which is the half that makes the first mean something', async () => {
    const markup = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo, PEOPLE_TAB)

    expect(markup).toContain('Bravo Manager')
    expect(markup).not.toContain('Alpha')
  })
})

// the property that makes the disjoint reading of doc 05 §0 and §1 safe. it is not a
// property of either read alone: a test of tab 0 by itself passes while a `viewer` falls
// through both tabs and is listed nowhere.
describe('the two tabs together cover every membership and neither lists a person twice', () => {
  it('partitions the organisation memberships', async () => {
    const session = memberOf(ids.people.alphaManager)
    const [people, pilots] = await withTenant(harness.app, session, async (tx) => [
      await listOrganizationPeople(tx, ids.organizations.alpha),
      await listOrganizationPilots(tx, ids.organizations.alpha),
    ])

    // read back through the seeding connection, so the expectation is the database's own
    // answer rather than a list restating the fixture
    const attached = await harness.owner
      .select({ personId: membership.personId })
      .from(membership)
      .where(eq(membership.organizationId, ids.organizations.alpha))

    const union = [...people, ...pilots].map((row) => row.id).sort()
    expect(union).toEqual(attached.map((row) => row.personId).sort())
    expect(new Set(union).size).toBe(union.length)
    expect(people.map((row) => row.id)).toContain(alphaViewer)
  })
})

// the migration's own property. the two columns are not separately guarded and could not
// be - a policy is on the table rather than on its columns - so what has to hold is that
// the table they landed on is one `person_shared_organization_or_self` already reaches.
describe('the columns 0012 added are readable only through the person policy', () => {
  it('gives a shared-organisation member the job title', async () => {
    const rows = await withTenant(harness.app, memberOf(ids.people.alphaManager), (tx) =>
      listOrganizationPeople(tx, ids.organizations.alpha),
    )
    expect(rows.find((row) => row.id === multiOperator)?.position).toBe('Placeholder Shared Post')
  })

  it('gives a session attached only to the other operator no row to read it from', async () => {
    const rows = await withTenant(harness.app, memberOf(ids.people.bravoManager), (tx) =>
      listOrganizationPeople(tx, ids.organizations.alpha),
    )
    expect(rows).toEqual([])
  })
})

describe('the people filter is a selection and the policy is the boundary', () => {
  it('narrows to the organisation being looked at', async () => {
    const rows = await withTenant(harness.app, memberOf(multiOperator), (tx) =>
      listOrganizationPeople(tx, delta),
    )
    expect(rows.map((row) => row.name)).toEqual(['Multi Operator Person'])
  })

  it('without it, reaches the people the session shares an organisation with and no further', async () => {
    // `listPeople` is the register with no organisation clause at all. what comes back is
    // wider than the screen asked for and still inside the boundary, which is the
    // difference between a wrong screen and a breach.
    const rows = await withTenant(harness.app, memberOf(multiOperator), listPeople)

    expect(rows.map((row) => row.name).sort()).toEqual([
      'Alpha Manager',
      'Alpha Pilot',
      'Alpha Viewer',
      'Multi Operator Person',
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
  it('renders the first tab when no tab is named, and runs that tab query alone', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    // tab 0's own register and no other: the absence of every serial is the evidence that
    // the fleet loader was never awaited
    expect(markup).toContain('Alpha Manager')
    expect(markup).not.toContain('SN-')
  })

  it('renders every tab label, so the four unbuilt ones are addressable', async () => {
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
