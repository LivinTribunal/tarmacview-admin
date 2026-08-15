import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createAuth, type Auth } from '@/lib/auth'
import { attemptSignIn } from '@/lib/auth/sign-in'
import { authAccount, authSession, authUser } from '@/lib/db/schema'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the property this suite exists for: every way of failing to sign in is one outcome.
// wrong password, an e-mail belonging to nobody, and an account carrying no password
// must be indistinguishable, because people legitimately exist in the pilot register
// with no credentials and a distinguishable rejection turns it into an e-mail oracle
// across several unrelated operator organisations - docs/specs/09-roles-permissions.md
// §"Sign-in and sign-out".
//
// it runs through harness.app, the application role, so it also shows the grants are
// enough to sign someone in without BYPASSRLS.

// placeholders, and deliberately not 32 hex characters: the conventions gate reads that
// shape as a possible organisation access token, correctly.
const PASSWORD = 'placeholder-password-1'
const WRONG_PASSWORD = 'placeholder-password-2'
const NOBODY = 'nobody@example.invalid'

let harness: TestDatabase
let ids: SeededIds
let auth: Auth

// credentials are provisioned inside this suite rather than in tests/support/fixtures.ts,
// so the shared seed stays credential-free. that is the person-is-not-account split: a
// person row is the pilot register, an account is a separate optional thing attached to
// one.
async function provision(
  personId: number,
  email: string,
  password: string | null,
): Promise<void> {
  const userId = `auth-user-${personId}`
  await harness.owner
    .insert(authUser)
    .values({ id: userId, name: `Placeholder ${personId}`, email, personId })

  // no account row at all when there is no password: that is the account provisioned
  // before anyone set one, and it is the third of the three causes.
  if (password === null) return

  const context = await auth.$context
  await harness.owner.insert(authAccount).values({
    id: `auth-account-${personId}`,
    userId,
    accountId: userId,
    providerId: 'credential',
    password: await context.password.hash(password),
  })
}

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)

  process.env.BETTER_AUTH_SECRET ??= 'placeholder-test-signing-secret'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  auth = createAuth(harness.app)

  await provision(ids.people.alphaManager, 'alpha.manager@example.invalid', PASSWORD)
  await provision(ids.people.bravoManager, 'bravo.manager@example.invalid', null)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

async function sessionCount(): Promise<number> {
  const rows = await harness.owner.select({ id: authSession.id }).from(authSession)
  return rows.length
}

describe('signing in', () => {
  it('accepts the right password, so the suite cannot pass by rejecting everything', async () => {
    const outcome = await attemptSignIn(auth, {
      email: 'alpha.manager@example.invalid',
      password: PASSWORD,
    })

    expect(outcome).toEqual({ signedIn: true })
    expect(await sessionCount()).toBeGreaterThan(0)
  })

  it('rejects an unknown e-mail, a wrong password and a passwordless account identically', async () => {
    const before = await sessionCount()

    const unknownEmail = await attemptSignIn(auth, { email: NOBODY, password: PASSWORD })
    const wrongPassword = await attemptSignIn(auth, {
      email: 'alpha.manager@example.invalid',
      password: WRONG_PASSWORD,
    })
    const noCredentials = await attemptSignIn(auth, {
      email: 'bravo.manager@example.invalid',
      password: PASSWORD,
    })

    // compared side by side, because the property is a relation between the three
    // rather than anything one of them carries alone. make the wrong-password case
    // distinguishable, or add a helpful "no account with that e-mail", and this fails.
    expect([unknownEmail, wrongPassword, noCredentials]).toEqual([
      { signedIn: false, errorKey: 'login.error' },
      { signedIn: false, errorKey: 'login.error' },
      { signedIn: false, errorKey: 'login.error' },
    ])

    // and none of them established a session
    expect(await sessionCount()).toBe(before)
  })
})
