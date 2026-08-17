import { ResourceForm } from '@/components/resource-form'
import { generalDocumentFormFields } from '@/lib/documents/fields'
import { t } from '@/lib/i18n'

// three fields and no `Kategória`, because the register a document is added through is what
// sets it - docs/specs/03-data-model.md §"The global document library in the rebuild".
export default function GeneralDocumentCreatePage() {
  return (
    <main>
      <h1>{t('document.create.title')}</h1>
      <ResourceForm fields={generalDocumentFormFields} />
    </main>
  )
}
