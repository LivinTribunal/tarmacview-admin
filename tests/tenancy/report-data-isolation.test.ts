import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reportPayload } from '@/lib/report/payload'
import { listOrganizationFlights, type FlightSelection } from '@/lib/tenant/scoped-flights'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the operator report is the first surface outside /admin to read tenant-owned data, so
// getting its scoping wrong is a cross-tenant read rather than a wrong screen. this is the
// tier-3 evidence and it runs against a real database, not a mock.
//
// the property under test is that `{org}` in the path is a **selection** and
// `flight_tenant_isolation` is the **boundary**. delete `withTenant` from the handler, or
// swap the policy for a hand-written `organization_id` filter, and these go red.

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const alphaSession = (): TenantSession => ({
  personId: ids.people.alphaManager,
  systemRole: 'member',
})
const bravoSession = (): TenantSession => ({
  personId: ids.people.bravoManager,
  systemRole: 'member',
})

// the fixtures import every flight in august 2026 and fly one of them in july, so both
// months carry rows and neither period is empty by accident
const august: FlightSelection = {
  from: new Date('2026-08-01T00:00:00.000Z'),
  to: new Date('2026-08-31T23:59:59.999Z'),
  pilotId: null,
  deviceId: null,
}
const july: FlightSelection = {
  from: new Date('2026-07-01T00:00:00.000Z'),
  to: new Date('2026-07-31T23:59:59.999Z'),
  pilotId: null,
  deviceId: null,
}

const read = (session: TenantSession, organizationId: number, selection: FlightSelection) =>
  withTenant(harness.app, session, (tx) => listOrganizationFlights(tx, organizationId, selection))

describe('tenant isolation: the report data endpoint under a member session', () => {
  it('reads another operator organisation as absent rather than as forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findOrganization(tx, ids.organizations.bravo),
    )

    // null, not a refusal: refusing would confirm the organisation is real, and the handler
    // turns this into the same 404 every other refusal gets
    expect(found).toBeNull()
  })

  it('carries no other operator flight, even when the path names their organisation', async () => {
    // the id in the path is bravo's and the session is alpha's. the policy is what empties
    // this, not the selection clause - which is why asking for the wrong tenant answers
    // nothing rather than answering bravo's report
    const rows = await read(alphaSession(), ids.organizations.bravo, august)
    expect(rows).toEqual([])
  })

  it('gives each operator their own, which is what makes the two exclusions mean something', async () => {
    const alpha = await read(alphaSession(), ids.organizations.alpha, august)
    const bravo = await read(bravoSession(), ids.organizations.bravo, august)

    expect(alpha.map((row) => row.fileName)).toEqual([
      'placeholder-flight-0002.txt',
      'placeholder-flight-0003.txt',
    ])
    expect(bravo.map((row) => row.fileName)).toEqual(['placeholder-flight-0004'])
  })
})

describe('the period filter runs on the derived date, not on the import instant', () => {
  it('files a july flight imported in august under july', async () => {
    const rows = await read(alphaSession(), ids.organizations.alpha, july)
    expect(rows.map((row) => row.fileName)).toEqual(['placeholder-flight-0001.txt'])

    const [payload] = reportPayload(rows, july).data.flights
    expect(payload?.flight_date).toBe('2026-07-14')
    expect(payload?.flight_date_display).toBe('14.07.2026')
  })

  it('falls back to the import instant where no leg states a start', async () => {
    const rows = await read(alphaSession(), ids.organizations.alpha, august)
    const flights = reportPayload(rows, august).data.flights

    // one of these has a leg carrying a null start and the other has no legs at all. both
    // reach the fallback, which is the branch that keys on there being no earliest start
    expect(flights.map((row) => row.flight_date)).toEqual(['2026-08-05', '2026-08-06'])
  })
})

describe('the rows a period-filtered report is tempted to drop, and must not', () => {
  it('lists an unassigned flight and a failed parse, with their gaps stated', async () => {
    const flights = reportPayload(
      await read(alphaSession(), ids.organizations.alpha, august),
      august,
    ).data.flights

    const [unassigned, failed] = flights
    expect(unassigned?.pilot_id).toBeNull()
    expect(unassigned?.device_id).toBeNull()
    expect(unassigned?.pilot_name).not.toBe('')
    expect(unassigned?.device_serial_number).not.toBe('')

    // a failed parse is still evidence that a flight happened. nothing in the read filters
    // on `parsing_status`, and this is the assertion that says so.
    expect(failed?.parsing_errors).toBe('Placeholder parse failure.')
  })

  it('judges no VLOS violation where the airframe has no device type', async () => {
    // `alphaImported` flies `alphaTwo`, the airframe with no device type. its 420.25 m is
    // inside the 500 m the typed airframe would carry, so the false here is the missing
    // limit rather than a distance that happened to be short.
    const [flight] = reportPayload(
      await read(alphaSession(), ids.organizations.alpha, july),
      july,
    ).data.flights

    expect(flight?.has_vlos_violation).toBe(false)
    expect(flight?.max_distance).toBe(420.25)
  })

  it('narrows to one pilot when the report asks for one, and to none when it asks for another', async () => {
    const mine = await read(alphaSession(), ids.organizations.alpha, {
      ...july,
      pilotId: ids.people.alphaPilot,
    })
    expect(mine.map((row) => row.fileName)).toEqual(['placeholder-flight-0001.txt'])

    // a filter is not a boundary either: naming another operator pilot narrows to nothing
    // rather than reaching across
    const theirs = await read(alphaSession(), ids.organizations.alpha, {
      ...july,
      pilotId: ids.people.bravoManager,
    })
    expect(theirs).toEqual([])
  })
})
