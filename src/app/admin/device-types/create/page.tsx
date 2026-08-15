import { DeviceTypeForm } from '@/components/device-type-form'
import { t } from '@/lib/i18n'

export default function DeviceTypeCreatePage() {
  return (
    <main>
      <h1>{t('deviceType.create.title')}</h1>
      <DeviceTypeForm />
    </main>
  )
}
