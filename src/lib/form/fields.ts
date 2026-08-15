import type { MessageKey } from '@/lib/i18n'

// one form field as a declaration: which control renders it and which constraints it
// carries. resource-agnostic, the same way src/lib/table/view.ts is - the per-resource
// field lists live with their resource and src/components/resource-form.tsx renders any
// of them.
//
// the constraints are the client-side floor contracts/forms/ records, never the server
// rule set.
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
