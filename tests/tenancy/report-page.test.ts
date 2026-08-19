import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import OrganizationReportPage from '@/app/organization-reports/[org]/page'
import { t } from '@/lib/i18n'
import type { TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the operator report page over a real Postgres and the real policies, rendered through the
// page itself - the shape tests/tenancy/organization-workspace.test.ts established. the
// scoping under it is R1's and tests/tenancy/report-data-isolation.test.ts already proves
// the reads; what this proves is that the page does not reach past them, and that what it
// renders is the payload's own figures.
//
// delete `withTenant` from the page and the cross-tenant assertions go red.

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

// both unwind the render by throwing, which is what makes them assertable
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error(NOT_FOUND)
  },
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}${to}`)
  },
}))

// the page reads its own clock - a screen has no `asOf` to be handed - so the fixture
// timeline is pinned here instead. only `Date` is faked: the container and the driver keep
// their real timers, and the fake is set after the container is up so nothing polling for it
// is left waiting on a clock that stopped.
const asOf = new Date('2026-08-15T00:00:00.000Z')

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
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

// one request to the report: the acting session, the organisation in the path, and the
// filter state on the query string exactly as the selector submits it
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

describe('who reaches the report at all', () => {
  it('sends a session that no longer resolves to a person to the login page', async () => {
    // the middleware only saw a cookie. a cookie that outlived its person is an anonymous
    // visitor here, and this is the branch that says so.
    await expect(open(null, ids.organizations.alpha)).rejects.toThrow(`${REDIRECT}/login`)
  })

  it('reads an organisation the session holds no membership of as absent', async () => {
    // not a refusal: a forbidden response would confirm the organisation is real, and it is
    // the same answer the data endpoint beside it gives
    await expect(
      open(memberOf(ids.people.alphaManager), ids.organizations.bravo),
    ).rejects.toThrow(NOT_FOUND)
  })

  it('reads an organisation id nothing carries as absent', async () => {
    await expect(open(superadmin(), 999_999)).rejects.toThrow(NOT_FOUND)
  })

  it('opens for a superadmin, who reaches every organisation', async () => {
    expect(await open(superadmin(), ids.organizations.bravo)).toContain('Operator Bravo')
  })
})

describe('the header identity, which comes off the organisation row and not off the payload', () => {
  it('names the operator and serves its logo through the one route that takes an id', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain('Operator Alpha')
    expect(markup).toContain(`/api/organizations/${ids.organizations.alpha}/logo`)

    // the stored path never reaches the browser
    expect(markup).not.toContain('organization-logos/')
  })

  it('renders no image for an operator with no logo, rather than a broken one', async () => {
    const markup = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo)

    expect(markup).toContain('Operator Bravo')
    expect(markup).not.toContain('/logo')
  })

  it('names both absent regulatory numbers rather than leaving a blank beside the label', async () => {
    // on a regulator-facing pack a blank beside `Číslo zápisu do registra` reads as "none
    // required". neither fixture organisation carries either number, so both labels are the
    // subject here.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.organization.registration.none'))
    expect(markup).toContain(t('report.organization.permit.none'))
  })

  it('stamps the day it was generated in the one format this application prints', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.header.generatedAt'))
    expect(markup).toContain('15.08.2026')
  })

  it('offers sign-out', async () => {
    expect(await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)).toContain(
      t('session.signOut'),
    )
  })
})

describe('the admin link, gated on the capability helper and deny-by-default', () => {
  it('is absent for a session the helper says no to', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).not.toContain(t('report.header.admin'))
    expect(markup).not.toContain('/admin/')
  })

  it('is present for one it says yes to, so the absence above is a decision', async () => {
    const markup = await open(superadmin(), ids.organizations.alpha)

    expect(markup).toContain(t('report.header.admin'))
    expect(markup).toContain('/admin/device-types')
  })
})

describe('the summary tiles show the payload own figures', () => {
  it('reports this month totals, with the decimal comma on the one that has a fraction', async () => {
    // august carries two alpha flights - one unassigned and one whose parse failed - and
    // neither names a pilot, so 2400 recorded seconds is 0,67 h and nobody was active
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.tile.flightHours'))
    expect(markup).toContain('0,67')
    expect(markup).toContain(
      t('report.period.selected', { from: '01.08.2026', to: '31.08.2026' }),
    )
  })

  it('carries no other operator figure or row', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).not.toContain('Bravo')
    expect(markup).not.toContain('SN-BRAVO')
  })
})

describe('the period selector round-trips through the query string', () => {
  it('changes the window and the figures with it', async () => {
    // july carries this operator's one flown-and-assigned flight: 5100 s and one pilot
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain(
      t('report.period.selected', { from: '01.07.2026', to: '31.07.2026' }),
    )
    expect(markup).toContain('1,42')
    expect(markup).not.toContain('0,67')
  })

  it('takes a custom range on the wire format the two date inputs submit', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'custom',
      date_from: '2026-07-01',
      date_to: '2026-07-14',
    })

    expect(markup).toContain(
      t('report.period.selected', { from: '01.07.2026', to: '14.07.2026' }),
    )
  })

  it('surfaces the query error for an unusable range rather than an empty report', async () => {
    // the two dates the wrong way round. a report answering zero here would say nothing was
    // flown, when what happened is that the range cannot be read - and the header and the
    // selector stay on screen so the reader can correct it.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'custom',
      date_from: '2026-08-14',
      date_to: '2026-08-01',
    })

    expect(markup).toContain(t('report.error.query'))
    expect(markup).toContain('Operator Alpha')
    expect(markup).not.toContain(t('report.tile.flights'))

    // and the warnings block, which takes no period, survives it. suppressing it would
    // answer a mistyped range with the screen that means nobody has anything pending.
    expect(markup).toContain(t('report.warning.title'))
    expect(markup).toContain('Alpha Second Pilot')
  })

  it('shows no period rather than the first one for a period it does not name', async () => {
    // an empty selection matches no option, and a browser left to itself displays the first -
    // `Tento mesiac` beside an error saying no period was read.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'next_month',
    })

    expect(markup).toContain(t('report.error.query'))
    expect(markup).toContain(t('report.period.none'))
    expect(markup).not.toContain('value="this_month" selected')
  })

  it('offers all three periods from wherever the reader is', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain(t('report.period.this_month'))
    expect(markup).toContain(t('report.period.last_month'))
    expect(markup).toContain(t('report.period.custom'))

    // and the one the reader is on is the one the selector shows, or a resubmitted form
    // would silently reset the window it was opened with
    expect(markup).toContain('value="last_month" selected')
  })
})

describe('the expiry-warnings block, keyed off the organisation own window', () => {
  it('lists a pilot inside the window and omits one outside it', async () => {
    // alpha's window is 60 days and the second pilot's certificate expires 47 days out, so
    // it is inside alpha's own window and outside the schema default of 40. the first
    // pilot's expires in 2027 and holds a training that has not lapsed, so they have
    // nothing to surface and no row.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.warning.title'))
    expect(markup).toContain('Alpha Second Pilot')
    expect(markup).toContain(t('report.pilot.certificateStatus.expiring'))
    expect(markup).toContain('01.10.2026')

    expect(markup).not.toContain('Alpha Pilot')
  })

  it('tells a pilot holding no training apart from one whose training is valid', async () => {
    // the gap and the pass are two different answers. `Bez školenia` is on the second pilot's
    // row; the first pilot holds a training that has not lapsed and is absent from the block
    // entirely.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.warning.training'))
    expect(markup).toContain(t('report.pilot.trainingStatus.none'))
  })

  it('says nothing about a certificate that never expires, which is a stated fact', async () => {
    // bravo's pilot holds a certificate with no expiry and no training at all. the training
    // gap lists and the certificate does not, which is the two states kept apart on one row.
    const markup = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo)

    expect(markup).toContain('Bravo Pilot')
    expect(markup).toContain(t('report.pilot.trainingStatus.none'))
    expect(markup).not.toContain(t('report.pilot.certificateStatus.noExpiry'))
  })

  it('renders no block at all where nobody has anything to surface', async () => {
    // charlie rosters nobody, so there is nothing to warn about. an empty block with a
    // heading over it would read as an all-clear.
    const markup = await open(superadmin(), ids.organizations.charlie)

    expect(markup).toContain('Operator Charlie')
    expect(markup).not.toContain(t('report.warning.title'))
  })
})
