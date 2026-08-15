import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/auth/next-path'

// the open-redirect table. src/middleware.ts hands the sign-in page the path it turned
// away, the browser hands it back, and a value that leaves this function unchanged is
// somewhere the application will send a person who has just typed their password.

describe('the post-sign-in path, validated', () => {
  it('keeps a relative path, query string and all', () => {
    expect(safeNext('/admin/device-types?page=2')).toBe('/admin/device-types?page=2')
  })

  const rejected = [
    ['a protocol-relative host', '//evil.example'],
    ['an absolute url', 'https://evil.example/admin'],
    ['a scheme behind a leading slash', '/https://evil.example'],
    ['a backslash, which browsers normalise to a slash', '/\\evil.example'],
    ['a tab, which browsers strip before resolving', '/\t/evil.example'],
    ['a newline, same reason', '/\n/evil.example'],
    ['a scheme with no path at all', 'javascript:alert(1)'],
    ['a bare host', 'evil.example'],
    ['the empty value', ''],
  ] as const

  it.each(rejected)('falls back to / for %s', (_reason, raw) => {
    expect(safeNext(raw)).toBe('/')
  })

  it('falls back to / for a missing value', () => {
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(null)).toBe('/')
  })
})
