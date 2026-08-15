import { t } from '@/lib/i18n'

// the catalogue is deployment-wide, so this register carries no tenant filter by design -
// docs/specs/03-data-model.md §DeviceType. it lists nothing yet: reading rows needs the
// schema, which is the next slice.
export default function DeviceTypeIndexPage() {
  return (
    <main>
      <h1>{t('deviceType.index.title')}</h1>
      <p>{t('deviceType.index.empty')}</p>
    </main>
  )
}
