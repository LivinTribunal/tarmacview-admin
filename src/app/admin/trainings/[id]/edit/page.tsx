import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { trainingFormFields } from '@/lib/trainings/fields'

// renders the same field set as create, unpopulated. populating it means a scoped read by
// id - findTraining in src/lib/tenant/scoped-trainings.ts - and that lands with the write
// path, which nothing in the rebuild has yet.
export default function TrainingEditPage() {
  return (
    <main>
      <h1>{t('training.edit.title')}</h1>
      <ResourceForm fields={trainingFormFields} />
    </main>
  )
}
