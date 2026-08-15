import { ResourceForm } from '@/components/resource-form'
import { deviceTypeFormFields } from '@/lib/device-types/fields'
import { t } from '@/lib/i18n'

export default function DeviceTypeCreatePage() {
  return (
    <main>
      <h1>{t('deviceType.create.title')}</h1>
      <ResourceForm fields={deviceTypeFormFields} />
    </main>
  )
}
