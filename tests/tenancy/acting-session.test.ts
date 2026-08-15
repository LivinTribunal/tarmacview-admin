import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveActingSession } from '@/lib/auth/session'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the system role is consulted exactly once, when a person authenticates
// (docs/specs/09-roles-permissions.md §"Axis A — system role, one per person"). this is
// that moment: resolveActingSession is where a claim about who is calling becomes the
// context every scoped read afterwards runs under.

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

describe('the acting session, resolved from the person row', () => {
  it('gives a person seeded member the member role', async () => {
    const session = await resolveActingSession(harness.app, ids.people.alphaManager)
    expect(session).toEqual({ personId: ids.people.alphaManager, systemRole: 'member' })
  })

  it('gives a person seeded superadmin the superadmin role, so the row is read and not assumed', async () => {
    const session = await resolveActingSession(harness.app, ids.people.systemAdmin)
    expect(session).toEqual({ personId: ids.people.systemAdmin, systemRole: 'superadmin' })
  })

  it('yields no session for a person id with no row, rather than one with a defaulted role', async () => {
    // `person.system_role` defaults to `member`, so a resolution that filled in a session
    // here would look ordinary and hand an id that belongs to nobody a working context.
    const session = await resolveActingSession(harness.app, 2_147_483_000)
    expect(session).toBeNull()
  })

  it("reaches the acting person's own row under a member context, which is what every sign-in depends on", async () => {
    // the read runs under `{ systemRole: 'member' }`, so only the own-row half of
    // `person_self_or_superadmin` admits it. drop that half and every non-superadmin
    // sign-in resolves to null, which reads as a rejected credential rather than as a
    // broken policy. the subject is the other organisation's manager on purpose: the
    // reach is a property of the policy, not of one tenant.
    const session = await resolveActingSession(harness.app, ids.people.bravoManager)
    expect(session).toEqual({ personId: ids.people.bravoManager, systemRole: 'member' })
  })

  it("never resolves one person's id to another person's role", async () => {
    const manager = await resolveActingSession(harness.app, ids.people.alphaManager)
    const admin = await resolveActingSession(harness.app, ids.people.systemAdmin)

    // side by side, because the property is a relation between two resolutions rather
    // than a value either one carries on its own.
    expect([manager?.systemRole, admin?.systemRole]).toEqual(['member', 'superadmin'])
  })
})
