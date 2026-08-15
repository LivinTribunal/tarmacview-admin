import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/lib/db/client'
import { authAccount, authSession, authUser, authVerification } from '@/lib/db/schema'

// accounts are provisioned by an administrator and reset by one. sign-up is disabled
// rather than merely unrouted, and no password-reset sender is configured, so neither
// self-service path can be reached even if something mounts a form at it -
// docs/specs/09-roles-permissions.md §"Account provisioning".
//
// a person is not an account: these tables hold credentials and link back to a person
// through auth_user.person_id, which stays null for the pilots who have no login.
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
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
})
