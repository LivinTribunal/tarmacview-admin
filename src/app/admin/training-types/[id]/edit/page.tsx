import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { trainingTypeFormFields } from '@/lib/training-types/fields'

// renders the same field set as create, unpopulated. populating it means a scoped read by
// id - findTrainingType in src/lib/tenant/scoped-training-types.ts - and that lands with
// the write path, which nothing in the rebuild has yet.
export default function TrainingTypeEditPage() {
  return (
    <main>
      <h1>{t('trainingType.edit.title')}</h1>
      <ResourceForm fields={trainingTypeFormFields} />
    </main>
  )
}
