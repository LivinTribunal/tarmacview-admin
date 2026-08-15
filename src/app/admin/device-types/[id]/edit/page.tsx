import { DeviceTypeForm } from '@/components/device-type-form'
import { t } from '@/lib/i18n'

// renders the same field set as create, unpopulated: loading the record needs the schema.
export default function DeviceTypeEditPage() {
  return (
    <main>
      <h1>{t('deviceType.edit.title')}</h1>
      <DeviceTypeForm />
    </main>
  )
}
