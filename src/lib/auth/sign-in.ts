import type { Auth } from '@/lib/auth'
import type { MessageKey } from '@/lib/i18n'

// one failure, whatever the cause. an unknown e-mail, a wrong password and an account
// that carries no password are the same outcome here, with the same message and no
// detail from the library passed through.
//
// this is a security property rather than a preference. `person.email` is nullable and
// people legitimately exist in the pilot register with no credentials at all
// (CONTEXT.md §People), so a response that tells "no such account" apart from "wrong
// password" answers "is this address registered here" for anyone who asks - across
// several unrelated operator organisations at once.
//
// the timing half is the library's: better-auth 1.6.29 hashes the submitted password
// before rejecting an unknown user, an account with no credential record, and an
// account whose credential record has a null password, so all three cost roughly what
// a real verification costs.
export type SignInOutcome = { signedIn: true } | { signedIn: false; errorKey: MessageKey }

const rejected: SignInOutcome = { signedIn: false, errorKey: 'login.error' }

// takes the instance rather than importing the singleton, so the suite can run this
// against a real database - the same split as resolveActingSession in ./session.ts.
export async function attemptSignIn(
  instance: Auth,
  credentials: { email: string; password: string },
  requestHeaders?: Headers,
): Promise<SignInOutcome> {
  try {
    await instance.api.signInEmail({
      body: { email: credentials.email, password: credentials.password },
      headers: requestHeaders,
    })
  } catch {
    return rejected
  }

  return { signedIn: true }
}
