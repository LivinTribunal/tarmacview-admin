import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deviceTypeFormFields } from '@/lib/device-types/fields'

// the contract is a client-side floor and complete only for the captured records - see
// docs/rebuild/00-operating-model.md §5 "Form contract" and contracts/README.md. So this
// suite asserts at-least, in both directions the floor allows: the rebuild may declare
// fields the capture never saw, and may carry constraints the capture never saw. Changing
// a value the capture *did* see is a deliberate edit here, not a silent pass.
//
// `rows` is presentation, not validation, and is not asserted.

type CapturedField = { name: string; control: string } & Record<string, string>
type FormContract = { create: CapturedField[]; edit: CapturedField[] }

const contract: FormContract = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../contracts/forms/device-types.json', import.meta.url)), 'utf8'),
)

const numericAttributes = ['min', 'max', 'maxlength', 'step'] as const

const fieldName = (captured: CapturedField) => captured.name.replace(/^data\./, '')

describe('form contract: create and edit share one field set', () => {
  it('so one declaration serves both forms', () => {
    expect(contract.create.map(fieldName).sort()).toEqual(contract.edit.map(fieldName).sort())
  })
})

for (const variant of ['create', 'edit'] as const) {
  describe(`form contract: device type ${variant}, at least the captured fields`, () => {
    it.each(contract[variant].map((captured) => [fieldName(captured), captured] as const))(
      '%s carries the captured control and constraints',
      (name, captured) => {
        const field = deviceTypeFormFields.find((candidate) => candidate.name === name)
        expect(field, `${name} is not declared in deviceTypeFormFields`).toBeDefined()
        if (!field) return

        expect(field.control).toBe(captured.control)
        if (captured.type) expect(field.type).toBe(captured.type)
        if (captured.required) expect(field.required).toBe(true)

        for (const attribute of numericAttributes) {
          const value = captured[attribute]
          if (value !== undefined) expect(field[attribute]).toBe(Number(value))
        }
      },
    )
  })
}
