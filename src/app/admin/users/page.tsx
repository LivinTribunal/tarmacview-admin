import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { mayManagePeople } from '@/lib/auth/capabilities'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { listPeople } from '@/lib/tenant/scoped-people'
import { withTenant } from '@/lib/tenant/tenant-context'
import { personTable, personTableRow } from '@/lib/users/fields'

// the people register. the read runs inside withTenant and carries no organisation filter
// of its own - src/lib/tenant/scoped-people.ts - so what a member sees is the people they
// share an organisation with because the policy says so, not because a WHERE clause
// remembered to.
//
// the write chrome is gated on what the database will admit rather than on the capability
// matrix, which is currently wider - mayManagePeople in src/lib/auth/capabilities.ts holds
// the reason and the issue that closes the gap.
export default async function PersonIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const mayManage = mayManagePeople(session.systemRole)
  const entries = await withTenant(db, session, listPeople)

  return (
    <main>
      <h1>{t('person.index.title')}</h1>
      <IndexTable declaration={personTable(mayManage)} rows={entries.map(personTableRow)} />
    </main>
  )
}
