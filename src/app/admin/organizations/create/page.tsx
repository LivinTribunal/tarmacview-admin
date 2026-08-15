import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { organizationFormFields } from '@/lib/organizations/fields'

export default function OrganizationCreatePage() {
  return (
    <main>
      <h1>{t('organization.create.title')}</h1>
      <ResourceForm fields={organizationFormFields} />
    </main>
  )
}
