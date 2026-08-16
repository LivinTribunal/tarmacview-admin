import { ResourceForm } from '@/components/resource-form'
import { flightFormFields } from '@/lib/flights/fields'
import { t } from '@/lib/i18n'

// renders the same field set as create, unpopulated. populating it means a scoped read by
// id - findFlight in src/lib/tenant/scoped-flights.ts - and that lands with the write path,
// which nothing in the rebuild has yet.
export default function FlightEditPage() {
  return (
    <main>
      <h1>{t('flight.edit.title')}</h1>
      <ResourceForm fields={flightFormFields} />
    </main>
  )
}
