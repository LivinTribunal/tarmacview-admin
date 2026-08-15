import sk from './messages/sk.json'

export type MessageKey = keyof typeof sk

// the predecessor was slovak-only with no i18n layer. every user-visible string in the
// rebuild resolves through here from the first line of ui code, so a second catalogue is
// a change in one file rather than a sweep through the components.
export const defaultLocale = 'sk'

// named placeholders, so a sentence with numbers in it stays one translatable string
// rather than fragments a component concatenates in the source language's word order.
export function t(key: MessageKey, values?: Readonly<Record<string, string | number>>): string {
  const message: string = sk[key]
  if (!values) return message
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  )
}
