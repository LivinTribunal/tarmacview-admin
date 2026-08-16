import { describe, expect, it } from 'vitest'
import { accountProvisioning } from '@/lib/auth/provisioning'

// docs/specs/03-data-model.md §"Account provisioning in the rebuild", asserted as a rule.
// there is no caller yet - nothing in the rebuild writes a resource - and that is why this
// exists: the branch is decided here rather than inside the first write path that needs it.

const credentials = (password: string, email: string | null = 'placeholder@example.invalid') => ({
  email,
  password,
  passwordConfirmation: password,
})

describe('creating a person', () => {
  it('with a blank password is a person and nothing else', () => {
    // the pilot who never signs in, and the common case rather than the edge one
    expect(accountProvisioning('create', credentials('', null))).toEqual({ provision: 'none' })
  })

  it('with a blank password and an e-mail is still a person and nothing else', () => {
    // an e-mail is a contact detail. it is not a request for credentials.
    expect(accountProvisioning('create', credentials(''))).toEqual({ provision: 'none' })
  })

  it('with a password provisions an account beside the person', () => {
    expect(accountProvisioning('create', credentials('placeholder-secret'))).toEqual({
      provision: 'account',
    })
  })
})

describe('editing a person', () => {
  it('with a blank password leaves the credential alone', () => {
    // doc 04: blank on edit means unchanged, never "set the password to empty"
    expect(accountProvisioning('edit', credentials(''))).toEqual({ provision: 'unchanged' })
  })

  it('with a password resets it', () => {
    expect(accountProvisioning('edit', credentials('placeholder-secret'))).toEqual({
      provision: 'reset',
    })
  })

  it('leaves a pilot with no e-mail unchanged when the password is blank', () => {
    expect(accountProvisioning('edit', credentials('', null))).toEqual({ provision: 'unchanged' })
  })
})

// the branch the contract cannot show, because the predecessor's captured form never
// revealed which way it went. `auth_user.email` is `not null` and unique while
// `person.email` is nullable, so this is a validation error and never a null insert.
describe('a password with no e-mail', () => {
  it.each(['create', 'edit'] as const)('is rejected on %s', (mode) => {
    expect(accountProvisioning(mode, credentials('placeholder-secret', null))).toEqual({
      provision: 'rejected',
      errorKey: 'person.error.passwordWithoutEmail',
    })
  })

  it('is rejected when the e-mail is present but blank', () => {
    expect(accountProvisioning('create', credentials('placeholder-secret', '   '))).toEqual({
      provision: 'rejected',
      errorKey: 'person.error.passwordWithoutEmail',
    })
  })
})

describe('the password rules, restated on the server side of the form', () => {
  it('rejects a confirmation that does not match', () => {
    expect(
      accountProvisioning('create', {
        email: 'placeholder@example.invalid',
        password: 'placeholder-secret',
        passwordConfirmation: 'placeholder-other',
      }),
    ).toEqual({ provision: 'rejected', errorKey: 'person.error.passwordMismatch' })
  })

  it('rejects one shorter than the eight characters doc 04 and the contract both carry', () => {
    expect(accountProvisioning('create', credentials('short'))).toEqual({
      provision: 'rejected',
      errorKey: 'person.error.passwordTooShort',
    })
  })

  it('treats a confirmation alone as an attempt to set one, rather than as blank', () => {
    // a typed confirmation with an empty password is a half-filled form, not "leave it"
    expect(
      accountProvisioning('edit', {
        email: 'placeholder@example.invalid',
        password: '',
        passwordConfirmation: 'placeholder-secret',
      }),
    ).toEqual({ provision: 'rejected', errorKey: 'person.error.passwordMismatch' })
  })
})
