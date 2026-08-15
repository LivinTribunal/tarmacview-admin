import { signIn } from '@/lib/auth/actions'
import { safeNext } from '@/lib/auth/next-path'
import { t } from '@/lib/i18n'

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// no client component. the action redirects back here with ?error=1 and the page renders
// the one message from that flag, so the failure path is identical with and without
// javascript - worth more on a sign-in page than nicer pending-state ergonomics.
//
// the fields are written inline rather than declared through FormField: that machinery
// exists to be asserted against contracts/forms/, the capture never fetched a sign-in
// page, and there must not be a contract invented for one.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  // validated on render as well as in the action, so the hidden field and the value
  // acted on come from the same rule
  const next = safeNext(first(params.next))
  const failed = first(params.error) !== undefined

  return (
    <main>
      <h1>{t('login.title')}</h1>

      {failed ? <p role="alert">{t('login.error')}</p> : null}

      <form action={signIn}>
        <input type="hidden" name="next" value={next} />

        <label htmlFor="email">{t('login.field.email')}</label>
        <input id="email" name="email" type="email" required autoComplete="username" />

        <label htmlFor="password">{t('login.field.password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />

        <button type="submit">{t('login.submit')}</button>
      </form>
    </main>
  )
}
