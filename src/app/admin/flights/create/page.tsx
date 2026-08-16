import { ResourceForm } from '@/components/resource-form'
import { flightFormFields } from '@/lib/flights/fields'
import { t } from '@/lib/i18n'

// the entry-mode radio renders every branch's fields at once rather than switching the
// form, because switching is behaviour and there is nothing to submit to yet. which branch
// a field belongs to is doc 07's; this page is the field set the form contract is asserted
// against.
export default function FlightCreatePage() {
  return (
    <main>
      <h1>{t('flight.create.title')}</h1>
      <ResourceForm fields={flightFormFields} />
    </main>
  )
}
