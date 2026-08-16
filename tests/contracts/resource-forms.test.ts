import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deviceTypeFormFields } from '@/lib/device-types/fields'
import type { FormField } from '@/lib/form/fields'
import { organizationFormFields } from '@/lib/organizations/fields'
import { trainingTypeFormFields } from '@/lib/training-types/fields'
import { trainingFormFields } from '@/lib/trainings/fields'
import { personFormFields } from '@/lib/users/fields'

// the contract is a client-side floor and complete only for the captured records - see
// docs/rebuild/00-operating-model.md §5 "Form contract" and contracts/README.md. So this
// suite asserts at-least, in both directions the floor allows: the rebuild may declare
// fields the capture never saw, and may carry constraints the capture never saw. Changing
// a value the capture *did* see is a deliberate edit here, not a silent pass.
//
// `rows` is presentation, not validation, and is not asserted.
//
// one suite over every declared register, the way src/components/resource-form.tsx is one
// renderer over every one of them. a resource joins by adding a line below.

type CapturedField = { name: string; control: string } & Record<string, string>
type FormContract = { create: CapturedField[]; edit: CapturedField[] }

const registers: readonly { resource: string; fields: readonly FormField[] }[] = [
  { resource: 'device-types', fields: deviceTypeFormFields },
  { resource: 'organizations', fields: organizationFormFields },
  { resource: 'training-types', fields: trainingTypeFormFields },
  { resource: 'trainings', fields: trainingFormFields },

  { resource: 'users', fields: personFormFields },
]

const constrainedAttributes = ['min', 'max', 'minlength', 'maxlength', 'step'] as const

// every one of those is a number except `step`, which also takes the keyword `any`.
// comparing that numerically would be worse than useless: Number('any') is NaN, and
// Object.is(NaN, NaN) is true, so a declaration carrying a nonsense `step: NaN` would
// satisfy the contract. the keyword is asserted as a keyword.
const expected = (captured: string) => (captured === 'any' ? 'any' : Number(captured))

const fieldName = (captured: CapturedField) => captured.name.replace(/^data\./, '')

const contractFor = (resource: string): FormContract =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../contracts/forms/${resource}.json`, import.meta.url)),
      'utf8',
    ),
  )

for (const register of registers) {
  const contract = contractFor(register.resource)

  describe(`form contract: ${register.resource} create and edit share one field set`, () => {
    it('so one declaration serves both forms', () => {
      expect(contract.create.map(fieldName).sort()).toEqual(contract.edit.map(fieldName).sort())
    })
  })

  for (const variant of ['create', 'edit'] as const) {
    describe(`form contract: ${register.resource} ${variant}, at least the captured fields`, () => {
      it.each(contract[variant].map((captured) => [fieldName(captured), captured] as const))(
        '%s carries the captured control and constraints',
        (name, captured) => {
          const field = register.fields.find((candidate) => candidate.name === name)
          expect(field, `${name} is not declared for ${register.resource}`).toBeDefined()
          if (!field) return

          expect(field.control).toBe(captured.control)
          if (captured.type) expect(field.type).toBe(captured.type)
          if (captured.required) expect(field.required).toBe(true)
          if (captured.multiple) expect(field.multiple).toBe(true)

          for (const attribute of constrainedAttributes) {
            const value = captured[attribute]
            if (value !== undefined) expect(field[attribute]).toBe(expected(value))
          }
        },
      )
    })
  }
}
