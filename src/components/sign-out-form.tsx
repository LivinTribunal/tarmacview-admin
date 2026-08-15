import { signOut } from '@/lib/auth/actions'
import { t } from '@/lib/i18n'

export function SignOutForm() {
  return (
    <form action={signOut}>
      <button type="submit">{t('session.signOut')}</button>
    </form>
  )
}
