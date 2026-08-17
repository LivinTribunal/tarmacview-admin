import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// the oracle every report parity suite asserts against, loaded once. it was a local copy in
// report-device-shape.test.ts and report-flight-shape.test.ts, and the pilots block is the
// third caller - the threshold src/lib/routes/identifier.ts states for this repo.
//
// contracts/report-schema.json is protected and is read, never edited: an assertion weakened
// to agree with the rebuild would make every gate report green while the payload was wrong.

export type OracleKey = { path: string; types: string[]; nullable: boolean }

export const oracle: { keys: OracleKey[] } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../contracts/report-schema.json', import.meta.url)),
    'utf8',
  ),
)

// the payload's shape as the oracle spells it: `null` and `array` are their own answers and
// everything else is the typeof, so a serialised number and a serialised numeric string are
// never mistaken for one another.
export const jsonType = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// the keys the oracle carries **directly** under a path - `data.pilots[].trainings` but not
// its members, and not the keys nested below them. each level of the payload asserts its own
// key set, which is what makes nesting part of parity rather than only the leaf names.
export const directKeys = (prefix: string): OracleKey[] =>
  oracle.keys.filter((key) => {
    const name = key.path.startsWith(prefix) ? key.path.slice(prefix.length) : null
    return name !== null && name !== '' && !name.includes('.') && !name.includes('[')
  })
