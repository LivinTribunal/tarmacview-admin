import { describe, expect, it } from 'vitest'
import { resolveSelection } from '@/lib/report/payload'

// the report's filter state - doc 06 §"Data endpoint". a null answer is the JSON error the
// rebuild returns where the predecessor served an HTML error page, so the cases that must
// produce one are named individually.

const asOf = new Date('2026-08-15T12:00:00Z')
const resolve = (query: string) => resolveSelection(new URLSearchParams(query), asOf)

describe('the period, resolved against an injected clock', () => {
  it('takes the calendar month the clock is in', () => {
    expect(resolve('period=this_month')).toEqual({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T23:59:59.999Z'),
      pilotId: null,
      deviceId: null,
    })
  })

  it('takes the one before it, crossing a year boundary without arithmetic of its own', () => {
    expect(resolveSelection(new URLSearchParams('period=last_month'), new Date('2026-01-09T00:00:00Z'))).toEqual({
      from: new Date('2025-12-01T00:00:00.000Z'),
      to: new Date('2025-12-31T23:59:59.999Z'),
      pilotId: null,
      deviceId: null,
    })
  })

  it('takes a custom range inclusive of both end days', () => {
    expect(resolve('period=custom&date_from=2026-07-01&date_to=2026-07-14')).toMatchObject({
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-14T23:59:59.999Z'),
    })
  })

  it('opens on this month when no period was picked, which is the report landing state', () => {
    expect(resolve('')).toEqual(resolve('period=this_month'))
  })
})

describe('what answers a JSON error rather than a payload', () => {
  it.each([
    ['an unrecognised period', 'period=next_month'],
    ['custom with no dates at all', 'period=custom'],
    ['custom missing one end', 'period=custom&date_from=2026-07-01'],
    ['custom with an unparseable date', 'period=custom&date_from=01.07.2026&date_to=14.07.2026'],
    ['a pilot filter that is not an id', 'pilot_id=all'],
    ['a device filter that is not an id', 'device_id=1e3'],
  ])('%s', (_label, query) => {
    expect(resolve(query)).toBeNull()
  })
})

describe('the two optional filters doc 06 records on the query string', () => {
  it('carries them through when they are ids', () => {
    expect(resolve('pilot_id=7&device_id=9')).toMatchObject({ pilotId: 7, deviceId: 9 })
  })

  it('reads an empty one as no filter, which is how the report submits them', () => {
    expect(resolve('pilot_id=&device_id=')).toMatchObject({ pilotId: null, deviceId: null })
  })
})
