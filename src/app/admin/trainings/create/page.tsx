import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { trainingFormFields } from '@/lib/trainings/fields'

export default function TrainingCreatePage() {
  return (
    <main>
      <h1>{t('training.create.title')}</h1>
      <ResourceForm fields={trainingFormFields} />
    </main>
  )
}
