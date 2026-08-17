import { redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { generalDocumentTable, generalDocumentTableRow } from '@/lib/documents/fields'
import { t } from '@/lib/i18n'
import { listGeneralDocuments } from '@/lib/tenant/scoped-documents'
import { withTenant } from '@/lib/tenant/tenant-context'

// the global library, which every session reads and only a superadmin writes. the read
// still runs inside withTenant: the policy is what admits the global rows, and a register
// that reached them outside a tenant transaction would be the one register in the
// application whose scoping is a decision rather than a policy -
// src/lib/tenant/scoped-documents.ts.
export default async function GeneralDocumentIndexPage() {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const entries = await withTenant(db, session, listGeneralDocuments)

  return (
    <main>
      <h1>{t('document.index.title')}</h1>
      <IndexTable declaration={generalDocumentTable} rows={entries.map(generalDocumentTableRow)} />
    </main>
  )
}
