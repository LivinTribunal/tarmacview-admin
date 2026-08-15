import { deviceTypeFormFields, type FormField } from '@/lib/device-types/fields'
import { t } from '@/lib/i18n'

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

// no submit handler: the write path needs a schema and a tenancy boundary, which are the
// next slice. this renders the field set the form contract is asserted against.
export function DeviceTypeForm() {
  return (
    <form>
      {deviceTypeFormFields.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name}>{t(field.labelKey)}</label>
          <Control field={field} />
        </div>
      ))}
    </form>
  )
}
