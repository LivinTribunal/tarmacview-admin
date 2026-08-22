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

// every scoped read the page makes, wrapped in a counter. test-only and over
// `importOriginal`, so the real query and the real policies still run and no `src/` file
// knows this exists - what it makes assertable is that opening a detail issues **no second
// read**, which is the claim the whole query-string-disclosure decision rests on.
const { reads, counted } = vi.hoisted(() => {
  const reads = { count: 0 }
  return {
    reads,
    counted:
      <Args extends unknown[], Result>(read: (...args: Args) => Result) =>
      (...args: Args): Result => {
        reads.count += 1
        return read(...args)
      },
  }
})

vi.mock('@/lib/tenant/scoped-organizations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant/scoped-organizations')>()
  return { ...real, findOrganization: counted(real.findOrganization) }
})

vi.mock('@/lib/tenant/scoped-people', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant/scoped-people')>()
  return { ...real, listOrganizationPilots: counted(real.listOrganizationPilots) }
})

vi.mock('@/lib/tenant/scoped-trainings', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant/scoped-trainings')>()
  return { ...real, listOrganizationTrainings: counted(real.listOrganizationTrainings) }
})

vi.mock('@/lib/tenant/scoped-flights', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant/scoped-flights')>()
  return { ...real, listOrganizationFlights: counted(real.listOrganizationFlights) }
})

vi.mock('@/lib/tenant/scoped-airframes', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant/scoped-airframes')>()
  return { ...real, listOrganizationAirframeReport: counted(real.listOrganizationAirframeReport) }
})

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

// the warnings block on its own. what this block does **not** say stopped being readable off
// the whole page the moment the pilots register landed under it: every rostered pilot has a
// row there and a never-expiring certificate reads as such in its own column, and both are
// correct. an absence asserted against the page would now be asserting that the register is
// missing rows.
function warningsBlock(markup: string): string {
  const opened = markup.indexOf(`<h2>${t('report.warning.title')}</h2>`)
  return opened === -1 ? '' : markup.slice(opened, markup.indexOf('</section>', opened))
}

describe('the expiry-warnings block, keyed off the organisation own window', () => {
  it('lists a pilot inside the window and omits one outside it', async () => {
    // alpha's window is 60 days and the second pilot's certificate expires 47 days out, so
    // it is inside alpha's own window and outside the schema default of 40. the first
    // pilot's expires in 2027 and holds a training that has not lapsed, so they have
    // nothing to surface and no row.
    const block = warningsBlock(
      await open(memberOf(ids.people.alphaManager), ids.organizations.alpha),
    )

    expect(block).toContain('Alpha Second Pilot')
    expect(block).toContain(t('report.pilot.certificateStatus.expiring'))
    expect(block).toContain('01.10.2026')

    expect(block).not.toContain('Alpha Pilot')
  })

  it('tells a pilot holding no training apart from one whose training is valid', async () => {
    // the gap and the pass are two different answers. `Bez školenia` is on the second pilot's
    // row; the first pilot holds a training that has not lapsed and is absent from the block
    // entirely.
    const block = warningsBlock(
      await open(memberOf(ids.people.alphaManager), ids.organizations.alpha),
    )

    expect(block).toContain(t('report.warning.training'))
    expect(block).toContain(t('report.pilot.trainingStatus.none'))
  })

  it('says nothing about a certificate that never expires, which is a stated fact', async () => {
    // bravo's pilot holds a certificate with no expiry and no training at all. the training
    // gap lists and the certificate does not, which is the two states kept apart on one row.
    const block = warningsBlock(
      await open(memberOf(ids.people.bravoManager), ids.organizations.bravo),
    )

    expect(block).toContain('Bravo Pilot')
    expect(block).toContain(t('report.pilot.trainingStatus.none'))
    expect(block).not.toContain(t('report.pilot.certificateStatus.noExpiry'))
  })

  it('renders no block at all where nobody has anything to surface', async () => {
    // charlie rosters nobody, so there is nothing to warn about. an empty block with a
    // heading over it would read as an all-clear.
    const markup = await open(superadmin(), ids.organizations.charlie)

    expect(markup).toContain('Operator Charlie')
    expect(markup).not.toContain(t('report.warning.title'))
  })
})

describe('the two tabs, addressed on the query string', () => {
  it('renders one at a time and links to the other on the period the reader is on', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain(t('report.tab.pilots'))
    expect(markup).toContain(t('report.tab.uas'))

    // a link a reader can send, and it carries the window they typed - without that,
    // switching tabs silently resets the period
    expect(markup).toContain('tab=uas')
    expect(markup).toContain('period=last_month')

    // the pilots tab is the one open, so the UAS register's own empty sentence and its
    // service column are not on the screen
    expect(markup).toContain(t('report.column.certificate'))
    expect(markup).not.toContain(t('report.column.service'))
  })

  it('reads a tab this application does not name as absent rather than falling back', async () => {
    // a link to a tab nobody built answering 200 is the reading that survives longest before
    // anyone notices. deliberately not the period's treatment.
    await expect(
      open(memberOf(ids.people.alphaManager), ids.organizations.alpha, { tab: 'flights' }),
    ).rejects.toThrow(NOT_FOUND)
  })
})

describe('the pilots table, one row per rostered pilot', () => {
  it('keeps a pilot who flew nothing in the period, beside one who flew', async () => {
    // july carries this operator's one flown-and-assigned flight, and the second pilot flew
    // none of it. dropping them would hide a pilot from the roster the report is evidence
    // about.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain('Alpha Pilot')
    expect(markup).toContain('Alpha Second Pilot')
    expect(markup).toContain('<td>1</td>')
    expect(markup).toContain('<td>0</td>')

    // the hours come off `total_hours` with the decimal comma the one formatter applies
    expect(markup).toContain('1,42')
  })

  it('tells a pilot holding no certificate from one holding a valid one', async () => {
    // three answers, not two: the gap names itself, the valid one prints its expiry, and
    // bravo's never-expiring certificate is the third - `report.pilot.certificateStatus.*`
    // renders all three and this column never recomputes one.
    const alpha = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)
    expect(alpha).toContain('30.06.2027')

    const bravo = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo)
    expect(bravo).toContain(t('report.pilot.certificateStatus.noExpiry'))
  })
})

describe('the UAS table, where a gap must never read as a pass', () => {
  it('reads an airframe with no device type as not configured and the rest as nothing', async () => {
    // `SN-ALPHA-0002` carries no device type, so it has no VLOS limit and no service interval
    // and can never register a service warning. the two typed airframes beside it are inside
    // their interval and say nothing, which is the not-due state - a cell keyed off
    // `service_due` would print that same nothing for all three.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      tab: 'uas',
    })

    expect(markup).toContain('SN-ALPHA-0001')
    expect(markup).toContain('SN-ALPHA-0002')
    expect(markup).toContain(t('device.warning.noDeviceType'))
    expect(markup.split(t('device.warning.noDeviceType')).length - 1).toBe(1)
    expect(markup).not.toContain(t('device.warning.serviceDue'))
  })
})

describe('the flights table, where every row of the period lists whatever state it is in', () => {
  it('keeps a failed parse and an unassigned flight, and offers no action for either', async () => {
    // august carries both: one flight nobody was assigned to and one whose parse failed.
    // dropping either loses the evidence that a flight happened, and `Priradiť`'s write is
    // not served - a button that does nothing tells a reader an action exists.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.flights.title'))
    expect(markup).toContain(t('report.flight.pilot.unassigned'))
    expect(markup).toContain(t('report.flight.device.unassigned'))
    expect(markup).toContain(t('flight.parsingStatus.failed'))
    expect(markup).toContain('Placeholder parse failure.')
    expect(markup).not.toContain('Priradiť')
  })

  it('renders the payload date and figures, in the formats this application prints', async () => {
    // july's flight: `flight_date_display` for the date and the decimal comma off the chrome
    // for the two measurements that carry a fraction
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
    })

    expect(markup).toContain('14.07.2026')
    expect(markup).toContain('420,25')
    expect(markup).toContain('95,5')
  })

  it('tells a flight that could not be judged from one that passed', async () => {
    // alpha's flights name an airframe with no device type, or no airframe at all, so neither
    // has a VLOS limit to be judged against and both name the gap. bravo's flight names a
    // typed airframe and stayed inside its limit, so it says nothing - which is the pass.
    // a cell keyed off `has_vlos_violation` prints the same nothing for all three.
    const alpha = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)
    expect(alpha).toContain(t('report.flight.vlos.notJudged'))

    const bravo = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo)
    expect(bravo).toContain('SN-BRAVO-0001')
    expect(bravo).not.toContain(t('report.flight.vlos.notJudged'))
    expect(bravo).not.toContain(t('report.flight.vlos.violation'))
  })
})

describe('the pilot filter narrows the payload, so the table and the tiles cannot disagree', () => {
  it('narrows both through the query string', async () => {
    // july's one flown-and-assigned flight belongs to the first pilot. filtering to the second
    // empties the table **and** the tiles above it - an in-memory filter over the rendered rows
    // would leave `Počet letov` stating the whole period.
    const flown = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
      pilot_id: String(ids.people.alphaPilot),
    })

    expect(flown).toContain('14.07.2026')
    expect(flown).toContain('1,42')

    const none = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
      pilot_id: String(ids.people.alphaSecondPilot),
    })

    expect(none).toContain(t('flight.index.empty'))
    expect(none).not.toContain('14.07.2026')

    // the tiles agree with the empty table rather than restating the unfiltered period
    expect(none).not.toContain('1,42')
  })

  it('offers the whole roster whatever the filter says, and opens on the pilot chosen', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
      pilot_id: String(ids.people.alphaPilot),
    })

    // both rostered pilots stay selectable, or a reader could never widen back out
    expect(markup).toContain(t('report.filter.pilot.all'))
    expect(markup).toContain('Alpha Second Pilot')
    expect(markup).toContain(`value="${ids.people.alphaPilot}" selected`)
  })

  it('leaves an organisation the session holds no membership of absent under a filter', async () => {
    // the filter is not a way around the boundary: the answer is the one the unfiltered page
    // already gives
    await expect(
      open(memberOf(ids.people.alphaManager), ids.organizations.bravo, {
        pilot_id: String(ids.people.bravoPilot),
      }),
    ).rejects.toThrow(NOT_FOUND)
  })
})

describe('the detail each row opens, which is a disclosure the url names', () => {
  it('opens a pilot with the three nested arrays the payload already carries', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'last_month',
      detail: String(ids.people.alphaPilot),
    })

    expect(markup).toContain(t('report.detail.pilot'))

    // trainings[], all-time: the classified one and the one that states nothing but its name
    expect(markup).toContain('Alpha Recurrent Training')
    expect(markup).toContain('Alpha Unclassified Training')
    expect(markup).toContain(t('report.pilot.training.unclassified'))
    expect(markup).toContain(t('report.pilot.training.noDate'))

    // filtered_flights[] and flights_by_device[], both period-filtered and both the same
    // rows - the july flight and the airframe it names
    expect(markup).toContain(t('report.detail.flights'))
    expect(markup).toContain('14.07.2026')
    expect(markup).toContain(t('report.detail.flightsByDevice'))
    expect(markup).toContain('SN-ALPHA-0002')
  })

  it('opens an airframe with the maintenance history as the technician stated it', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      tab: 'uas',
      detail: String(ids.airframes.alphaServiced),
    })

    expect(markup).toContain(t('report.detail.uas'))
    expect(markup).toContain('SN-ALPHA-0004')

    // both readings verbatim, in the two notations the column accepts, and neither
    // recomputed into the other
    expect(markup).toContain('41:30')
    expect(markup).toContain('43,5')
    expect(markup).toContain('20.05.2026')

    // the newer service stated no cycle count. a `0` there would be a reading nobody took.
    expect(markup).toContain(t('report.maintenance.totalFlights.none'))
  })

  it('issues no second read for a detail, which is what makes it a disclosure and not a page', async () => {
    // the assertion the whole decision rests on. every nested array is already in the payload
    // the page holds, so a detail that grows a query fails here.
    reads.count = 0
    await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, { tab: 'uas' })
    const closed = reads.count

    reads.count = 0
    await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      tab: 'uas',
      detail: String(ids.airframes.alphaServiced),
    })

    expect(closed).toBeGreaterThan(0)
    expect(reads.count).toBe(closed)
  })

  it('opens nothing for an id the payload does not carry, and names no other operator', async () => {
    // the scoping is structural here rather than a check somebody has to remember: another
    // operator's pilot was never in `data.pilots[]` to be found.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      detail: String(ids.people.bravoPilot),
    })

    expect(markup).toContain('Operator Alpha')
    expect(markup).not.toContain(t('report.detail.pilot'))
    expect(markup).not.toContain('Bravo')
  })

  it('leaves an organisation the session holds no membership of absent with a detail open', async () => {
    // neither parameter is a way around the scoping: the answer is the one the closed page
    // already gives
    await expect(
      open(memberOf(ids.people.alphaManager), ids.organizations.bravo, {
        tab: 'uas',
        detail: String(ids.airframes.bravoOne),
      }),
    ).rejects.toThrow(NOT_FOUND)
  })
})

describe('the documents panel, the read side of the workspace registers', () => {
  it('counts each of the four groups off the operator own buckets', async () => {
    // alpha holds one operations document, one form, two permits and three occurrence
    // reports. `(2)` on permits is what fails if anything filters on `is_public`, since only
    // one of the two is ticked - and doc 06 §"The documents panel in the rebuild" decides
    // that flag reads nothing here.
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(t('report.documents.title'))
    expect(markup).toContain(t('report.documents.documents', { count: 1 }))
    expect(markup).toContain(t('report.documents.forms', { count: 1 }))
    expect(markup).toContain(t('report.documents.permits', { count: 2 }))
    expect(markup).toContain(t('report.documents.incidents', { count: 3 }))

    expect(markup).toContain('Alpha Operations Manual')
    expect(markup).toContain('Placeholder Occurrence With Injury')
  })

  it('links each file through a route that takes an id, never through its stored path', async () => {
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain(
      `/organization-reports/${ids.organizations.alpha}/permits/${ids.documents.alphaPermit}/download`,
    )
    expect(markup).toContain(`/api/incidents/${ids.incidents.alphaInjury}/file`)

    // the stored path never reaches the browser. asserted as the whole stored value, because
    // `permits/` alone appears in the download path this panel is meant to carry.
    expect(markup).not.toContain('operations-documents/placeholder-alpha-manual.pdf')
    expect(markup).not.toContain('forms/placeholder-alpha-form.pdf')
    expect(markup).not.toContain('permits/placeholder-alpha-permit.pdf')
    expect(markup).not.toContain('incidents/placeholder-alpha-incident.pdf')
  })

  it('keeps an occurrence report that names no file, and names the gap', async () => {
    // dropping it would lose the evidence that an occurrence was filed, and a link on it
    // would point at a route that answers not-found
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha)

    expect(markup).toContain('Placeholder Occurrence Unanswered')
    expect(markup).toContain(t('report.documents.noFile'))
    expect(markup).not.toContain(`/api/incidents/${ids.incidents.alphaUnanswered}/file`)
  })

  it('keeps a bucket the operator has nothing in, counted zero', async () => {
    // bravo holds one form and one occurrence report and nothing else. a group that vanished
    // would read as a panel that was never asked, not as a bucket that is empty.
    const markup = await open(memberOf(ids.people.bravoManager), ids.organizations.bravo)

    expect(markup).toContain(t('report.documents.documents', { count: 0 }))
    expect(markup).toContain(t('report.documents.forms', { count: 1 }))
    expect(markup).toContain(t('report.documents.permits', { count: 0 }))
    expect(markup).toContain(t('report.documents.incidents', { count: 1 }))
  })

  it('renders the panel for an operator whose every group is empty', async () => {
    const markup = await open(superadmin(), ids.organizations.charlie)

    expect(markup).toContain(t('report.documents.title'))
    expect(markup).toContain(t('report.documents.documents', { count: 0 }))
    expect(markup).toContain(t('report.documents.incidents', { count: 0 }))
  })

  it('survives an unusable range, because it takes no period', async () => {
    // the same reasoning the warnings block above it carries: withdrawing an operator's
    // permits because two dates arrived the wrong way round is not an answer to a mistyped
    // range
    const markup = await open(memberOf(ids.people.alphaManager), ids.organizations.alpha, {
      period: 'custom',
      date_from: '2026-08-14',
      date_to: '2026-08-01',
    })

    expect(markup).toContain(t('report.error.query'))
    expect(markup).toContain(t('report.documents.permits', { count: 2 }))
    expect(markup).toContain('Alpha Operations Manual')
  })
})
