import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { mayManageDeviceTypes } from '@/lib/auth/capabilities'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { listDeviceTypes } from '@/lib/device-types/catalogue'
import { deviceTypeTable, deviceTypeTableRow } from '@/lib/device-types/fields'
import { t } from '@/lib/i18n'
import { withTenant } from '@/lib/tenant/tenant-context'

// the read runs inside withTenant even though the catalogue itself is deployment-wide,
// because the airframe count beside each entry is not - src/lib/device-types/catalogue.ts.
// the chrome is handed rows and nothing else.
//
// the write chrome is gated on what the database will admit rather than on the capability
// matrix - mayManageDeviceTypes in src/lib/auth/capabilities.ts holds the reason. the gate
// reaches `editPath` and nothing upstream of it: the catalogue stays readable to every
// session, which is what `device_type_deployment_wide` admits.
export default async function DeviceTypeIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const mayManage = mayManageDeviceTypes(session.systemRole)
  const entries = await withTenant(db, session, listDeviceTypes)

  return (
    <main>
      <h1>{t('deviceType.index.title')}</h1>
      <IndexTable declaration={deviceTypeTable(mayManage)} rows={entries.map(deviceTypeTableRow)} />
    </main>
  )
}
