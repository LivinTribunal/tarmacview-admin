import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { mapFormFields } from '@/lib/maps/fields'

// renders the same field set as create, unpopulated: loading the record needs a write path
// to load it for, and the KML layers relation manager is its own slice.
export default function MapEditPage() {
  return (
    <main>
      <h1>{t('map.edit.title')}</h1>
      <ResourceForm fields={mapFormFields} />
    </main>
  )
}
