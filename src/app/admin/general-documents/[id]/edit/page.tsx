import { ResourceForm } from '@/components/resource-form'
import { generalDocumentFormFields } from '@/lib/documents/fields'
import { t } from '@/lib/i18n'

// renders the same field set as create, unpopulated. populating it means a scoped read by
// id - findDocument in src/lib/tenant/scoped-documents.ts - and that lands with the
// write path, which nothing in the rebuild has yet.
export default function GeneralDocumentEditPage() {
  return (
    <main>
      <h1>{t('document.edit.title')}</h1>
      <ResourceForm fields={generalDocumentFormFields} />
    </main>
  )
}
