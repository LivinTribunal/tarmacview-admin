import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { personFormFields } from '@/lib/users/fields'

// served to any session, the way contracts/routes.json records it. the register offers the
// link only where the write would be admitted, but the route itself is not gated: the form
// has no submit handler for anybody yet, so gating it would be an authority check standing
// in front of nothing. it lands with the write path - #48.
export default function PersonCreatePage() {
  return (
    <main>
      <h1>{t('person.create.title')}</h1>
      <ResourceForm fields={personFormFields} />
    </main>
  )
}
