import type { FormField } from '@/lib/form/fields'
import { t } from '@/lib/i18n'

// the create/edit chrome, once, for every register - the form counterpart of
// src/components/index-table.tsx. it takes a field declaration and renders it; no schema
// type and no resource name reach it.

function Control({ field }: { field: FormField }) {
  if (field.control === 'textarea') {
    return (
      <textarea
        id={field.name}
        name={field.name}
        required={field.required}
        maxLength={field.maxlength}
        rows={field.rows}
      />
    )
  }

  return (
    <input
      id={field.name}
      name={field.name}
      type={field.type}
      required={field.required}
      min={field.min}
      max={field.max}
      maxLength={field.maxlength}
      step={field.step}
    />
  )
}

// still no submit handler, deliberately: the capture was GET-only, so
// contracts/routes.json can assert nothing about a write and there is no write path
// anywhere in the rebuild yet. this renders the field set the form contract is asserted
// against.
export function ResourceForm({ fields }: { fields: readonly FormField[] }) {
  return (
    <form>
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name}>{t(field.labelKey)}</label>
          <Control field={field} />
        </div>
      ))}
    </form>
  )
}
