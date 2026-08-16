import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { flightTable, flightTableRow } from '@/lib/flights/fields'
import { t } from '@/lib/i18n'
import { listFlights } from '@/lib/tenant/scoped-flights'
import { withTenant } from '@/lib/tenant/tenant-context'

// the register is tenant-owned, so the read runs inside withTenant and carries no
// organisation filter of its own - src/lib/tenant/scoped-flights.ts. the chrome is handed
// rows and nothing else, so an unassigned flight and a failed parse reach it exactly as
// they are stored.
export default async function FlightIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const entries = await withTenant(db, session, listFlights)

  return (
    <main>
      <h1>{t('flight.index.title')}</h1>
      <IndexTable declaration={flightTable} rows={entries.map(flightTableRow)} />
    </main>
  )
}
