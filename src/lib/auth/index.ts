import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db, type Database } from '@/lib/db/client'
import { authAccount, authSession, authUser, authVerification } from '@/lib/db/schema'

// accounts are provisioned by an administrator and reset by one. sign-up is disabled
// rather than merely unrouted, and no password-reset sender is configured, so neither
// self-service path can be reached even if something mounts a form at it -
// docs/specs/09-roles-permissions.md §"Account provisioning".
//
// a person is not an account: these tables hold credentials and link back to a person
// through auth_user.person_id, which stays null for the pilots who have no login.
//
// split from the exported singleton the way createDatabase/db is, so the sign-in suite
// can point an instance at its own container without the module reaching for the
// deployment's connection.
export function createAuth(connection: Database) {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(connection, {
      provider: 'pg',
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        personId: { type: 'number', required: false, input: false },
      },
    },
    // a server action has no response to attach a set-cookie to, so the session cookie
    // is written through next's own cookie store. it must stay last in the list.
    plugins: [nextCookies()],
  })
}

export type Auth = ReturnType<typeof createAuth>

export const auth = createAuth(db)
