import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { listDeviceTypes } from '@/lib/device-types/catalogue'
import { deviceTypeTable, deviceTypeTableRow } from '@/lib/device-types/fields'
import { t } from '@/lib/i18n'
import { withTenant } from '@/lib/tenant/tenant-context'

// the read runs inside withTenant even though the catalogue itself is deployment-wide,
// because the airframe count beside each entry is not - src/lib/device-types/catalogue.ts.
// the chrome is handed rows and nothing else.
export default async function DeviceTypeIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const entries = await withTenant(db, session, listDeviceTypes)

  return (
    <main>
      <h1>{t('deviceType.index.title')}</h1>
      <IndexTable declaration={deviceTypeTable} rows={entries.map(deviceTypeTableRow)} />
    </main>
  )
}
