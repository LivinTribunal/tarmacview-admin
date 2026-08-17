import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'
import { reportPayload } from '@/lib/report/payload'
import { listOrganizationAirframeReport } from '@/lib/tenant/scoped-airframes'
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

// the service clock, injected for the reason the period's is: "overdue by n days" is only
// testable against a stated instant
const asOf = new Date('2026-08-15T00:00:00Z')

// the whole payload, read the way the handler reads it - both blocks inside one
// `withTenant`, so what scopes them is the policy and not two separate filters
const report = async (
  session: TenantSession,
  organizationId: number,
  selection: FlightSelection,
) => {
  const rows = await withTenant(harness.app, session, async (tx) => ({
    entries: await listOrganizationFlights(tx, organizationId, selection),
    airframes: await listOrganizationAirframeReport(tx, organizationId),
  }))
  return reportPayload(rows.entries, rows.airframes, selection, asOf)
}

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

    const [payload] = (await report(alphaSession(), ids.organizations.alpha, july)).data.flights
    expect(payload?.flight_date).toBe('2026-07-14')
    expect(payload?.flight_date_display).toBe('14.07.2026')
  })

  it('falls back to the import instant where no leg states a start', async () => {
    const flights = (await report(alphaSession(), ids.organizations.alpha, august)).data.flights

    // one of these has a leg carrying a null start and the other has no legs at all. both
    // reach the fallback, which is the branch that keys on there being no earliest start
    expect(flights.map((row) => row.flight_date)).toEqual(['2026-08-05', '2026-08-06'])
  })
})

describe('the rows a period-filtered report is tempted to drop, and must not', () => {
  it('lists an unassigned flight and a failed parse, with their gaps stated', async () => {
    const flights = (await report(alphaSession(), ids.organizations.alpha, august)).data.flights

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
    const [flight] = (await report(alphaSession(), ids.organizations.alpha, july)).data.flights

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

describe('tenant isolation: the airframes block of the same payload', () => {
  it('carries the operator own fleet, whether or not each airframe flew in the period', async () => {
    const payload = await report(alphaSession(), ids.organizations.alpha, august)

    // three airframes and two august flights, neither of which names one: an airframe that
    // flew nothing still lists, because the report is evidence about the fleet
    expect(payload.data.devices.map((row) => row.serial_number)).toEqual([
      'SN-ALPHA-0001',
      'SN-ALPHA-0002',
      'SN-ALPHA-0004',
    ])
  })

  it('carries no airframe at all when the path names another operator organisation', async () => {
    const payload = await report(alphaSession(), ids.organizations.bravo, august)

    // the policy is what empties both blocks, not the selection clause
    expect(payload.data.devices).toEqual([])
    expect(payload.data.flights).toEqual([])
  })

  it('never carries another operator maintenance history', async () => {
    const payload = await report(alphaSession(), ids.organizations.alpha, august)
    const history = payload.data.devices.flatMap((row) => row.maintenance_logs)

    // bravo's own record is dated 2026-06-10 and is not among these
    expect(history.map((log) => log.maintenance_date)).toEqual(['2026-07-05', '2026-05-20'])
  })
})

describe('the service baseline the report serves is composed from stated readings', () => {
  it('takes both halves from the records that stated them', async () => {
    const payload = await report(alphaSession(), ids.organizations.alpha, august)
    const serviced = payload.data.devices.find((row) => row.serial_number === 'SN-ALPHA-0004')

    // the newest record states no cycle count, so the calendar half comes from it and the
    // cycle half from the older record that did state one
    expect(serviced?.service_calendar_baseline_date).toBe('2026-07-05')
    expect(serviced?.service_baseline_cycles).toBe(120)

    // and nothing was recomputed: this airframe has flown nothing, and the stated 120 stands
    expect(serviced?.service_lifetime_cycles).toBe(0)
    expect(serviced?.service_is_configured).toBe(true)
  })

  it('falls the calendar baseline back to the first recorded flight derived date', async () => {
    const payload = await report(alphaSession(), ids.organizations.alpha, august)
    const flown = payload.data.devices.find((row) => row.serial_number === 'SN-ALPHA-0002')

    // `alphaTwo` has never been serviced. its one flight was imported on 3 august and flown
    // on 14 july, so a baseline keyed on `created_at` reports 2026-08-03 and goes red here -
    // an airframe's service clock dated from when its logs were uploaded
    expect(flown?.service_calendar_baseline_date).toBe('2026-07-14')
  })

  it('states the gap on an airframe with no device type, which must never read as a pass', async () => {
    const payload = await report(alphaSession(), ids.organizations.alpha, august)
    const flown = payload.data.devices.find((row) => row.serial_number === 'SN-ALPHA-0002')

    expect(flown?.max_vlos_meters).toBeNull()
    expect(flown?.service_is_configured).toBe(false)
    expect(flown?.service_due).toBe(false)
    expect(flown?.service_warning).toBe(t('device.warning.noDeviceType'))
  })

  it('agrees with data.flights[] about the period, airframe by airframe', async () => {
    const payload = await report(alphaSession(), ids.organizations.alpha, july)

    for (const airframe of payload.data.devices) {
      const its = payload.data.flights.filter((flight) => flight.device_id === airframe.id)
      const dates = its.map((flight) => flight.flight_date).sort()

      expect(airframe.total_flights, airframe.serial_number).toBe(its.length)
      expect(airframe.last_flight_date, airframe.serial_number).toBe(dates.at(-1) ?? null)
    }

    // and the window carries a flight, or the loop above would pass over an empty report
    expect(payload.data.flights).toHaveLength(1)
    expect(payload.data.devices.find((row) => row.serial_number === 'SN-ALPHA-0002')?.total_flights).toBe(1)
  })

  it('counts lifetime cycles all-time, so they do not move when the period narrows', async () => {
    const flownIn = await report(alphaSession(), ids.organizations.alpha, july)
    const quiet = await report(alphaSession(), ids.organizations.alpha, august)
    const of = (payload: typeof quiet) =>
      payload.data.devices.find((row) => row.serial_number === 'SN-ALPHA-0002')

    // august carries no flight of this airframe and july carries its only one. the period
    // totals differ; the lifetime figure is the same number under both
    expect(of(quiet)?.total_flights).toBe(0)
    expect(of(flownIn)?.total_flights).toBe(1)
    expect(of(quiet)?.service_lifetime_cycles).toBe(1)
    expect(of(flownIn)?.service_lifetime_cycles).toBe(1)
    expect(of(quiet)?.lifetime_flights_count).toBe(1)
  })
})
