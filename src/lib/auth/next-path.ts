// where to send someone after they sign in. src/middleware.ts puts the path it turned
// away into ?next=, and the browser hands it back, so by the time it reaches us it is
// untrusted input like any other query value. an unvalidated one is an open redirect -
// the sign-in page sends the visitor to somebody else's host, and it looks like the
// application did it.
const fallback = '/'

// tab, newline and carriage return are stripped from a url before a browser resolves
// it, so a control character between the slashes rebuilds the protocol-relative case
// that the `//` test below rejects. no real path here carries one.
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x20 || code === 0x7f
  })
}

// only a single-slash-prefixed relative path survives. everything else falls back.
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return fallback

  // `//host/path` is protocol-relative, and absolute to a browser
  if (raw.startsWith('//')) return fallback

  // a backslash normalises to a slash in the url parsers browsers ship, so `/\evil`
  // reaches the same place `//evil` does
  if (raw.includes('\\')) return fallback

  // a scheme anywhere, however it got past the leading slash
  if (raw.includes('://')) return fallback

  if (hasControlCharacter(raw)) return fallback

  return raw
}
