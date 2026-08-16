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
  control: 'input' | 'textarea' | 'select'
  // absent on a hidden input alone, which renders no label. inventing a string nobody can
  // ever see would be a translatable message with no reader.
  labelKey?: MessageKey
  type?: 'text' | 'number' | 'date' | 'file' | 'email' | 'password' | 'radio' | 'hidden'
  required?: boolean
  // a select taking more than one value. the people register's `Roly` and `Typy osvedčení`
  // are the first two.
  multiple?: boolean
  min?: number
  max?: number
  minlength?: number
  maxlength?: number
  // the one html constraint here that takes a keyword as well as a number
  step?: number | 'any'
  rows?: number
  // the file filter, as a comma-separated accept list
  accept?: string
  // the choices of a select, or of a radio group. the labels resolve through src/lib/i18n
  // like every other user-visible string, so the stored value and the word for it stay
  // separable.
  options?: readonly { value: string; labelKey: MessageKey }[]
}
