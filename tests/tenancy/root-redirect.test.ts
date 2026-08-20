import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import RootPage from '@/app/page'
import type { TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// where `/` lands, over a real Postgres and the real policies - docs/specs/03-data-model.md
// §"Membership in the rebuild" decides that the primary organisation derives from the
// primary-contact flag on a membership, and this is the read behind it.
//
// the property: **the primary-contact row that decides the destination is the acting
// person's own**. delete the `person_id` filter from `findPrimaryOrganization` and the
// co-member and the superadmin cases below both go red, because
// `membership_tenant_isolation` hands a member every attachment to an organisation they
// belong to and hands a superadmin the deployment's.

const REDIRECT = 'placeholder-redirect:'

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

// redirect() unwinds by throwing, which is what makes the destination assertable
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}${to}`)
  },
}))

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
  wiring.db = harness.app
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const memberOf = (personId: number): TenantSession => ({ personId, systemRole: 'member' })

// one visit to `/` as the given session, answering with wherever it sent them
async function landing(session: TenantSession | null): Promise<string> {
  wiring.session = session
  try {
    await RootPage()
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    if (message.startsWith(REDIRECT)) return message.slice(REDIRECT.length)
    throw thrown
  }
  throw new Error('the root page rendered instead of redirecting')
}

describe('the root lands on the acting session own organisation report', () => {
  it("sends a primary contact to their organisation's report", async () => {
    expect(await landing(memberOf(ids.people.alphaManager))).toBe(
      `/organization-reports/${ids.organizations.alpha}`,
    )
  })

  it('sends the other operator primary contact to theirs, so the destination is resolved and not fixed', async () => {
    expect(await landing(memberOf(ids.people.bravoManager))).toBe(
      `/organization-reports/${ids.organizations.bravo}`,
    )
  })
})

describe('the primary-contact row is the acting person own, which is the tenant property', () => {
  it('does not send a co-member to the organisation somebody else is primary contact of', async () => {
    // `alphaPilot` belongs to alpha and is primary contact of nothing. the policy admits
    // alpha's membership rows to them, so a read missing its `person_id` filter answers
    // alpha's manager's row here and lands one operator's pilot on a report they were never
    // the contact for.
    expect(await landing(memberOf(ids.people.alphaPilot))).toBe('/admin/device-types')
  })

  it('does not send a superadmin belonging to no organisation to somebody else report', async () => {
    // a superadmin's context admits every membership in the deployment, so the same missing
    // filter hands them the lowest organisation id - another operator's report, reached by
    // typing nothing at all.
    expect(await landing({ personId: ids.people.systemAdmin, systemRole: 'superadmin' })).toBe(
      '/admin/device-types',
    )

    // and that is the ordinary case rather than an error: the destination it keeps is the
    // deployment-wide catalogue, which every session may read
    expect(await landing(memberOf(ids.people.alphaSecondPilot))).toBe('/admin/device-types')
  })
})

describe('who reaches the root at all', () => {
  it('sends a session that no longer resolves to a person to the login page', async () => {
    // src/middleware.ts only saw a cookie. a cookie that outlived its person is anonymous
    // here, the same branch the report page carries.
    expect(await landing(null)).toBe('/login')
  })
})
