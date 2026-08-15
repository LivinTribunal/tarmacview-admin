import sk from './messages/sk.json'

export type MessageKey = keyof typeof sk

// the predecessor was slovak-only with no i18n layer. every user-visible string in the
// rebuild resolves through here from the first line of ui code, so a second catalogue is
// a change in one file rather than a sweep through the components.
export const defaultLocale = 'sk'

// `DD.MM.YYYY`, the one date format this application prints. a `date` column arrives as
// `YYYY-MM-DD` and a timestamp as a Date, and both are the same thing to a reader.
//
// the components are read in UTC, which is the instant the row carries. *which* zone a
// reader should see one in is a decision nothing has needed yet - it wants an
// organisation or a browser to key off, and neither is available here.
export function formatDate(value: Date | string | null): string | null {
  if (value === null) return null
  const at = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value
  if (Number.isNaN(at.getTime())) return null

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(at.getUTCDate())}.${pad(at.getUTCMonth() + 1)}.${at.getUTCFullYear()}`
}

// named placeholders, so a sentence with numbers in it stays one translatable string
// rather than fragments a component concatenates in the source language's word order.
export function t(key: MessageKey, values?: Readonly<Record<string, string | number>>): string {
  const message: string = sk[key]
  if (!values) return message
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  )
}
