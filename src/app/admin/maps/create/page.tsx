import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { mapFormFields } from '@/lib/maps/fields'

export default function MapCreatePage() {
  return (
    <main>
      <h1>{t('map.create.title')}</h1>
      <ResourceForm fields={mapFormFields} />
    </main>
  )
}
