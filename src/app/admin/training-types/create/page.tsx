import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { trainingTypeFormFields } from '@/lib/training-types/fields'

export default function TrainingTypeCreatePage() {
  return (
    <main>
      <h1>{t('trainingType.create.title')}</h1>
      <ResourceForm fields={trainingTypeFormFields} />
    </main>
  )
}
