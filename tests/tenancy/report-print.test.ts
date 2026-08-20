import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import OrganizationReportPrintPage from '@/app/organization-reports/[org]/print/page'
import OrganizationReportPage from '@/app/organization-reports/[org]/page'
import { flight } from '@/lib/db/schema'
import { t } from '@/lib/i18n'
import { printHref } from '@/lib/report/view'
import type { TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the printed operator pack over a real Postgres and the real policies, rendered through the
// page itself - tests/tenancy/report-page.test.ts's shape, one route over.
//
// delete `withTenant` from the print page and the cross-tenant assertions go red. what the
// rest of this file proves is the property a printed compliance pack lives or dies on: every
// row of every register is on it.

const NOT_FOUND = 'placeholder-not-found'
const REDIRECT = 'placeholder-redirect:'

const { wiring } = vi.hoisted(() => ({
  wiring: { db: null as unknown, session: null as unknown },
}))

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  get db() {
    return wiring.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  actingSession: async () => wiring.session,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error(NOT_FOUND)
  },
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}${to}`)
  },
}))

const asOf = new Date('2026-08-15T00:00:00.000Z')

// more july flights than any page size the chrome offers - `pageSizes` tops out at 50 before
// `all` and `initialState` defaults to 10 - each carrying an altitude nothing else on the pack
// reports. a print view rendered through `IndexTable` drops row eleven of these silently, which
// on a regulator-facing document is a gap reading as a fact.
const BULK = 60
const bulkAltitude = (index: number) => `${1000 + index}.5`
const bulkPrinted = (index: number) => `<td>${1000 + index},5</td>`

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)

  // seeded through the owner connection with the fixtures, and dated by `created_at` because
  // a flight with no legs takes it as its date - which is the derivation the report already
  // filters on
  await harness.owner.insert(flight).values(
    Array.from({ length: BULK }, (unused, index) => ({
      organizationId: ids.organizations.alpha,
      fileName: `placeholder-bulk-${index}.txt`,
      entryMode: 'dji_log' as const,
      pilotId: ids.people.alphaPilot,
      deviceId: ids.airframes.alphaOne,
      importedBy: ids.people.alphaManager,
      parsingStatus: 'processed' as const,
      parsingErrors: null,
      totalFlightTimeSeconds: 600,
      maxAltitudeMeters: bulkAltitude(index),
      maxDistanceMeters: '150',
      totalDistanceMeters: '400',
      createdAt: new Date('2026-07-20T09:00:00Z'),
    })),
  )

  wiring.db = harness.app

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(asOf)
}, 300_000)

afterAll(async () => {
  vi.useRealTimers()
  await harness?.stop()
})

const memberOf = (personId: number): TenantSession => ({ personId, systemRole: 'member' })
const superadmin = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

// one request to the print view: the acting session, the organisation in the path, and the
// filter state the anchor carried off the screen
async function print(
  session: TenantSession | null,
  org: number,
  search: Record<string, string> = {},
): Promise<string> {
  wiring.session = session
  return renderToStaticMarkup(
    await OrganizationReportPrintPage({
      params: Promise.resolve({ org: String(org) }),
      searchParams: Promise.resolve(search),
    }),
  )
}

async function open(
  session: TenantSession | null,
  org: number,
  search: Record<string, string> = {},
): Promise<string> {
  wiring.session = session
  return renderToStaticMarkup(
    await OrganizationReportPage({
      params: Promise.resolve({ org: String(org) }),
      searchParams: Promise.resolve(search),
    }),
  )
}

describe('who reaches the printed pack at all', () => {
  it('sends a session that no longer resolves to a person to the login page', async () => {
    // §Access: the report, its data endpoint and its print view all turn an anonymous request
    // away. the middleware only saw a cookie, and a cookie that outlived its person is
    // anonymous here.
    await expect(print(null, ids.organizations.alpha)).rejects.toThrow(`${REDIRECT}/login`)
  })

  it('reads an organisation the session holds no membership of as absent', async () => {
    // not a refusal: `{org}` is a selection, and the answer is the one the page and the data
    // endpoint beside it already give
    await expect(
      print(memberOf(ids.people.alphaManager), ids.organizations.bravo),
    ).rejects.toThrow(NOT_FOUND)
  })

  it('stays absent when another operator id rides in on the filter', async () => {
    await expect(
      print(memberOf(ids.people.alphaManager), ids.organizations.bravo, {
        pilot_id: String(ids.people.bravoPilot),
      }),
    ).rejects.toThrow(NOT_FOUND)
  })

  it('reads an organisation id nothing carries as absent', async () => {
    await expect(print(superadmin(), 999_999)).rejects.toThrow(NOT_FOUND)
  })

  it('prints for a superadmin, who reaches every organisation', async () => {
    expect(await print(superadmin(), ids.organizations.bravo)).toContain('Operator Bravo')
  })
})

describe('the document the reader gets, which is items 1 to 6 and no affordances', () => {
  it('carries the header, the warnings, the tiles and all three registers', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain('Operator Alpha')
    expect(markup).toContain(t('report.header.generatedAt'))

    // the header repeats the screen's four keys rather than sharing a component, because the
    // two surfaces differ in the chrome around them - so each fact under it is pinned here
    // too. a blank beside `Číslo zápisu do registra` on a pack reads as *none required*.
    expect(markup).toContain(t('report.organization.registration.none'))
    expect(markup).toContain(t('report.organization.permit.none'))
    expect(markup).toContain(`/api/organizations/${ids.organizations.alpha}/logo`)
    expect(markup).not.toContain('organization-logos/')

    expect(markup).toContain(t('report.warning.title'))
    expect(markup).toContain('Alpha Second Pilot')
    expect(markup).toContain(t('report.pilot.certificateStatus.expiring'))
    expect(markup).toContain(t('report.tile.flightHours'))

    expect(markup).toContain(t('report.tab.pilots'))
    expect(markup).toContain(t('report.column.service'))
    expect(markup).toContain(t('report.flights.title'))
  })

  it('offers nowhere to go and nothing to submit, because a pack is evidence and not a screen', async () => {
    // the panels of item 7 are affordances on paper: the documents panel's links are inert,
    // `Nahrať letové povolenie` is a write, and the admin link and sign-out are navigation
    const markup = await print(superadmin(), ids.organizations.alpha)

    expect(markup).not.toContain(t('report.documents.title'))
    expect(markup).not.toContain(t('report.header.admin'))
    expect(markup).not.toContain(t('session.signOut'))
    expect(markup).not.toContain('<form')
  })

  it('stamps the day it was generated, in the one format this application prints', async () => {
    // the decision doc 06 owed this slice: a date and no clock time. `src/lib/i18n` resolves
    // in UTC, so a time of day on a Slovak pack would print UTC and read as local.
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain('15.08.2026')
    expect(markup).not.toContain('00:00')
  })
})

describe('every row prints, because a pack that omits one is a gap reading as a fact', () => {
  it('prints a register longer than any page size the chrome offers, in full', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    for (let index = 0; index < BULK; index += 1) {
      expect(markup, bulkPrinted(index)).toContain(bulkPrinted(index))
    }

    // and the july flight the fixtures already carry, so the bulk rows did not displace it
    expect(markup).toContain('14.07.2026')
  })

  it('carries no page size, no search box, no column toggle and no pager', async () => {
    // the chrome is what would have truncated it. this is the assertion that fails the moment
    // the pack is rendered through `IndexTable` instead.
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    for (const chrome of ['table.pageSize', 'table.search', 'table.columns', 'table.next'] as const) {
      expect(markup, chrome).not.toContain(t(chrome))
    }
  })

  it('keeps a failed parse and an unassigned flight, the rows a pack most has to show', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('flight.parsingStatus.failed'))
    expect(markup).toContain('Placeholder parse failure.')
    expect(markup).toContain(t('report.flight.pilot.unassigned'))
    expect(markup).toContain(t('report.flight.device.unassigned'))
  })

  it('names the airframe with no device type rather than letting the gap read as a pass', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain('SN-ALPHA-0002')
    expect(markup).toContain(t('device.warning.noDeviceType'))
  })
})

describe('both registers print, because a tab is an address on screen and not a section', () => {
  it.each<Record<string, string>>([{}, { tab: 'pilots' }, { tab: 'uas' }, { tab: 'flights' }])(
    'prints the pilots and the UAS registers for %o',
    async (search) => {
      // `?tab=` is not read here, so an unnamed tab does not 404 the pack either - the page's
      // not-found branch belongs to a parameter this rendering ignores
      const markup = await print(
        memberOf(ids.people.alphaManager),
        ids.organizations.alpha,
        search,
      )

      expect(markup).toContain(t('report.tab.pilots'))
      expect(markup).toContain(t('report.column.certificate'))
      expect(markup).toContain(t('report.column.service'))
    },
  )

  it('opens no detail, because a pack about one pilot is not a pack about the operator', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      detail: String(ids.people.alphaPilot),
    })

    expect(markup).not.toContain(t('report.detail.pilot'))
    expect(markup).not.toContain(t('report.detail.trainings'))
  })
})

describe('the pack matches the screen it was printed from', () => {
  it('follows the anchor from a last-month screen and produces a last-month pack', async () => {
    const screen = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })
    const href = printHref(
      ids.organizations.alpha,
      new URLSearchParams({ period: 'last_month' }),
    )

    // the link the reader presses, and then the document it leads to. a print view reverting
    // to *this month* would contradict the screen it was pressed on.
    expect(screen).toContain(t('report.period.print'))
    expect(screen).toContain(href)

    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain(
      t('report.period.selected', { from: '01.07.2026', to: '31.07.2026' }),
    )

    // july's figures and not august's, in the formats this application prints
    expect(markup).toContain('14.07.2026')
    expect(markup).toContain('420,25')
    expect(markup).not.toContain(
      t('report.period.selected', { from: '01.08.2026', to: '31.08.2026' }),
    )
  })

  it('states the filter it was narrowed by, and states the unfiltered case too', async () => {
    // a screen shows its narrowing in the controls the reader submitted it with; the document
    // has none, so a pack filtered to one pilot with nothing saying so reads as the whole
    // operator's
    const filtered = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
      pilot_id: String(ids.people.alphaPilot),
    })

    expect(filtered).toContain(t('report.filter.pilot'))
    expect(filtered).toContain('Alpha Pilot')
    expect(filtered).not.toContain(t('report.filter.pilot.all'))

    const whole = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(whole).toContain(t('report.filter.pilot.all'))
  })
})

describe('an unusable range prints the error and never a pack of zeroes', () => {
  it('prints the query error, keeps the header and the warnings, and prints no register', async () => {
    // the page's own substitution. a pack answering zero would say nothing was flown when what
    // happened is that two dates arrived the wrong way round - and the warnings take no
    // period, so a mistyped range must not withdraw a lapsing certificate.
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'custom',
      date_from: '2026-08-14',
      date_to: '2026-08-01',
    })

    expect(markup).toContain(t('report.error.query'))
    expect(markup).toContain('Operator Alpha')
    expect(markup).toContain(t('report.warning.title'))
    expect(markup).toContain('Alpha Second Pilot')

    expect(markup).not.toContain(t('report.tile.flights'))
    expect(markup).not.toContain(t('report.column.service'))
    expect(markup).not.toContain(t('report.flights.title'))
  })

  it('prints the same error for a period this application does not name', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'next_month',
    })

    expect(markup).toContain(t('report.error.query'))
    expect(markup).not.toContain(t('report.tile.flights'))
  })
})

describe('the pack carries this operator figures and nobody else', () => {
  it('names no other operator, its pilots or its airframes', async () => {
    const markup = await print(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).not.toContain('Bravo')
    expect(markup).not.toContain('SN-BRAVO')
  })
})
