import sk from './messages/sk.json'

export type MessageKey = keyof typeof sk

// the predecessor was slovak-only with no i18n layer. every user-visible string in the
// rebuild resolves through here from the first line of ui code, so a second catalogue is
// a change in one file rather than a sweep through the components.
export const defaultLocale = 'sk'

export function t(key: MessageKey): string {
  return sk[key]
}
