import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { mayManageMaps } from '@/lib/auth/capabilities'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { mapTable, mapTableRow } from '@/lib/maps/fields'
import { listMaps } from '@/lib/maps/register'
import { withTenant } from '@/lib/tenant/tenant-context'

// the geozone maps register. every session reads every map - a map belongs to no operator,
// and the organisations it is assigned to are not on this register at all, which is what
// keeps one operator from reading another off it.
//
// the write chrome is gated on what the database will admit rather than on the capability
// matrix, which is wider - mayManageMaps in src/lib/auth/capabilities.ts holds the reason.
export default async function MapIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const mayManage = mayManageMaps(session.systemRole)
  const entries = await withTenant(db, session, listMaps)

  return (
    <main>
      <h1>{t('map.index.title')}</h1>
      {mayManage && <a href="/admin/maps/create">{t('map.index.create')}</a>}
      <IndexTable declaration={mapTable(mayManage)} rows={entries.map(mapTableRow)} />
    </main>
  )
}
