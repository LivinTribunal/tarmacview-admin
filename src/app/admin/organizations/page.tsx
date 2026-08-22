import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { mayManageOrganizations } from '@/lib/auth/capabilities'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { organizationTable, organizationTableRow } from '@/lib/organizations/fields'
import { listOrganizations } from '@/lib/tenant/scoped-organizations'
import { withTenant } from '@/lib/tenant/tenant-context'

// the tenant register itself. the read runs inside withTenant and carries no organisation
// filter of its own - src/lib/tenant/scoped-organizations.ts. it is handed the session as
// well as the transaction, which the two sibling registers do not need: only this one has
// a column whose meaning depends on who is asking.
//
// the create chrome is gated on what the database will admit; the workspace link beside it
// is not, and src/lib/organizations/fields.ts holds why the two differ.
export default async function OrganizationIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const mayManage = mayManageOrganizations(session.systemRole)
  const entries = await withTenant(db, session, (tx) => listOrganizations(tx, session))

  return (
    <main>
      <h1>{t('organization.index.title')}</h1>
      <IndexTable
        declaration={organizationTable(mayManage)}
        rows={entries.map(organizationTableRow)}
      />
    </main>
  )
}
