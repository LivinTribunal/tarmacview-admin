'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { safeNext } from '@/lib/auth/next-path'
import { attemptSignIn } from '@/lib/auth/sign-in'

// a missing field is submitted as an empty string rather than rejected here, so a form
// posted without one lands on the same failure as a wrong password.
function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

export async function signIn(form: FormData): Promise<void> {
  const next = safeNext(field(form, 'next'))
  const outcome = await attemptSignIn(
    auth,
    { email: field(form, 'email'), password: field(form, 'password') },
    await headers(),
  )

  // redirect() reports itself by throwing, so it sits outside every catch: wrap it with
  // the attempt above and a successful sign-in is caught and reported as the failure.
  if (!outcome.signedIn) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=1`)
  }

  redirect(next)
}

// a server action, so it is a POST the framework origin-checks. a GET link would be
// triggerable by any prefetch or embedded image.
export async function signOut(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // a session that was already gone is a signed-out visitor, which is what was asked
    // for. the redirect below is the whole outcome either way.
  }

  redirect('/login')
}
