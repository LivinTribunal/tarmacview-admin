import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { listTrainingTypes } from '@/lib/tenant/scoped-training-types'
import { withTenant } from '@/lib/tenant/tenant-context'
import { trainingTypeTable, trainingTypeTableRow } from '@/lib/training-types/fields'

// the register is tenant-owned, so the read runs inside withTenant and carries no
// organisation filter of its own - src/lib/tenant/scoped-training-types.ts. the chrome is
// handed rows and nothing else.
export default async function TrainingTypeIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const entries = await withTenant(db, session, listTrainingTypes)

  return (
    <main>
      <h1>{t('trainingType.index.title')}</h1>
      <IndexTable declaration={trainingTypeTable} rows={entries.map(trainingTypeTableRow)} />
    </main>
  )
}
