import type { MessageKey } from '@/lib/i18n'

// what the `Heslo` and `Potvrdenie hesla` fields on doc 04 §UserResource's form mean, as a
// rule rather than as a handler. nothing in the rebuild writes a resource yet, so there is
// no caller - but the rule is the one the contract cannot show, because the predecessor's
// captured form never revealed which branch it took, and deciding it inside a write path
// later is deciding it in the dark.
//
// docs/specs/03-data-model.md §"Account provisioning in the rebuild" is the decision; this
// is it in code, shaped like safeNext and attemptSignIn beside it - pure, and assertable
// without a database.

export type ProvisioningInput = {
  // nullable, and load-bearing: a pilot exists as a flight-log subject with no e-mail and
  // no credentials - CONTEXT.md §People
  email: string | null
  password: string
  passwordConfirmation: string
}

// `unchanged` is the edit-with-a-blank-password case, and it is the one worth naming: it
// means leave the credential alone, never set the password to empty.
export type Provisioning =
  | { provision: 'none' }
  | { provision: 'account' }
  | { provision: 'reset' }
  | { provision: 'unchanged' }
  | { provision: 'rejected'; errorKey: MessageKey }

const blank = (value: string) => value.trim() === ''

// a person is not an account. creating one with no password creates a `person` row and
// nothing else - no `auth_user`, no `auth_account` - and that is the common case rather
// than an edge one.
//
// the rejection is the branch the form itself cannot express: `auth_user.email` is
// `not null` and unique while `person.email` is nullable, so credentials with no e-mail
// are an account nobody could ever sign in with. it is a validation error and never a null
// insert.
export function accountProvisioning(
  mode: 'create' | 'edit',
  input: ProvisioningInput,
): Provisioning {
  if (blank(input.password) && blank(input.passwordConfirmation)) {
    return mode === 'create' ? { provision: 'none' } : { provision: 'unchanged' }
  }

  if (input.password !== input.passwordConfirmation) {
    return { provision: 'rejected', errorKey: 'person.error.passwordMismatch' }
  }

  // doc 04's floor, and the contract's `minlength`. a server rule rather than a trusted
  // client attribute, which is why it is restated here.
  if (input.password.length < 8) {
    return { provision: 'rejected', errorKey: 'person.error.passwordTooShort' }
  }

  if (input.email === null || blank(input.email)) {
    return { provision: 'rejected', errorKey: 'person.error.passwordWithoutEmail' }
  }

  return mode === 'create' ? { provision: 'account' } : { provision: 'reset' }
}
