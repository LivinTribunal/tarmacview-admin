import sk from './messages/sk.json'

// the predecessor was slovak-only with no i18n layer. every user-visible string in the
// rebuild resolves through here from the first line of ui code, so adding a second
// catalogue is a new file rather than a sweep through the components.
const catalogues = { sk }

export type Locale = keyof typeof catalogues
export const defaultLocale: Locale = 'sk'

export function t(key: keyof typeof sk, locale: Locale = defaultLocale): string {
  return catalogues[locale][key]
}
