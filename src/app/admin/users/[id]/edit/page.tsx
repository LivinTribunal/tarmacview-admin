import { ResourceForm } from '@/components/resource-form'
import { t } from '@/lib/i18n'
import { personFormFields } from '@/lib/users/fields'

// renders the same field set as create, unpopulated, as the sibling registers do.
// populating it means a scoped read by id - findPerson in
// src/lib/tenant/scoped-people.ts - and that lands with the write path.
//
// `Heslo` is blank here and stays blank: on edit, an untouched password field means
// unchanged and never "set the password to empty" -
// accountProvisioning in src/lib/auth/provisioning.ts.
export default function PersonEditPage() {
  return (
    <main>
      <h1>{t('person.edit.title')}</h1>
      <ResourceForm fields={personFormFields} />
    </main>
  )
}
