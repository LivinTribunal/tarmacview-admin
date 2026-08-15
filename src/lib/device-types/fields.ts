import type { MessageKey } from '@/lib/i18n'

export type FormField = {
  name: string
  control: 'input' | 'textarea'
  labelKey: MessageKey
  type?: 'text' | 'number'
  required?: boolean
  min?: number
  max?: number
  maxlength?: number
  step?: number
  rows?: number
}

// the device-type form declared once, rendered by both create and edit.
// contracts/forms/device-types.json is the oracle for this list - the constraints are a
// client-side floor, never the server rule set.
export const deviceTypeFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'not-a-control',
    labelKey: 'deviceType.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'max_vlos',
    control: 'input',
    labelKey: 'deviceType.field.max_vlos',
    type: 'number',
    step: 0.01,
  },
  {
    name: 'service_interval',
    control: 'input',
    labelKey: 'deviceType.field.service_interval',
    type: 'number',
    min: 0,
    step: 1,
  },
  {
    name: 'service_interval_months',
    control: 'input',
    labelKey: 'deviceType.field.service_interval_months',
    type: 'number',
    min: 1,
    step: 1,
  },
  {
    name: 'battery_service_interval',
    control: 'input',
    labelKey: 'deviceType.field.battery_service_interval',
    type: 'number',
    min: 0,
    step: 1,
  },
  {
    name: 'maintenance_instructions',
    control: 'textarea',
    labelKey: 'deviceType.field.maintenance_instructions',
    maxlength: 65535,
    rows: 5,
  },
]
