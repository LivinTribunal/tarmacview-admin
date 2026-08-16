import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { device, flight, flightLog, person } from '@/lib/db/schema'
import { findFlight, listFlights } from '@/lib/tenant/scoped-flights'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the flight register is the airworthiness record - docs/specs/03-data-model.md §"Flights in
// the rebuild". so this file carries two different claims: the ordinary policy scoping every
// register here has, and the one that is not a policy at all, that a flight naming another
// operator's airframe is refused by the foreign key. the second half runs under a
// **superadmin** session, whose policy admits every row, so the constraint is the only thing
// left that can refuse it. downgrade either composite foreign key to a plain one and those
// cases go red while every read below stays green, which is precisely the failure mode they
// guard.
//
// everything runs through harness.app and nothing through harness.owner except the read-back
// checks: a missing GRANT on either table or either sequence surfaces as `permission denied`
// on the first member read rather than as a puzzle later.

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
const superadminSession = (): TenantSession => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

// drizzle wraps the driver error, so the half worth asserting on - the Postgres error code
// and the constraint that refused - is on `cause`. naming it is the difference between
// "something refused this" and "the foreign key refused this": a missing GRANT throws too,
// and would satisfy a bare rejects.toThrow().
type Refusal = { code?: string; constraint_name?: string; message?: string }

async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run()
  } catch (error) {
    return ((error as { cause?: Refusal }).cause ?? {}) as Refusal
  }
  throw new Error('the statement was not refused')
}

const FOREIGN_KEY_VIOLATION = '23503'

describe('tenant isolation: the flight register under a member session', () => {
  it('an unscoped read returns only the acting tenant rows', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    expect(rows.map((row) => row.fileName)).toEqual([
      'placeholder-flight-0001.txt',
      'placeholder-flight-0002.txt',
      'placeholder-flight-0003.txt',
    ])
  })

  it('the other tenant sees its own, which is the half that makes the first mean something', async () => {
    const rows = await withTenant(harness.app, bravoSession(), listFlights)
    expect(rows.map((row) => row.fileName)).toEqual(['placeholder-flight-0004'])
  })

  it('a superadmin reaches both, so the two exclusions above are the policy and not an empty read', async () => {
    const rows = await withTenant(harness.app, superadminSession(), listFlights)
    expect(rows).toHaveLength(4)
  })

  it('finds a flight of the acting tenant by id', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findFlight(tx, ids.flights.alphaImported),
    )
    expect(found?.fileName).toBe('placeholder-flight-0001.txt')
  })

  it('a cross-tenant id returns not-found rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findFlight(tx, ids.flights.bravoManual),
    )
    // null, not a throw and not a refusal: refusing would confirm the row exists
    expect(found).toBeNull()
  })

  it('hides another operator legs entirely, even from an unscoped select', async () => {
    const rows = await withTenant(harness.app, alphaSession(), (tx) => tx.select().from(flightLog))
    expect(rows.map((row) => row.organizationId)).toEqual([
      ids.organizations.alpha,
      ids.organizations.alpha,
      ids.organizations.alpha,
    ])
  })
})

describe('the rows a register is tempted to drop, and must not', () => {
  it('lists a flight with no pilot and no airframe, as unassigned rather than absent', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    const unassigned = rows.find((row) => row.fileName === 'placeholder-flight-0002.txt')

    // assignment is a later step, so both are null on the row and null in the cells - a gap,
    // never a pass, and never a reason to hide the flight
    expect(unassigned?.pilotId).toBeNull()
    expect(unassigned?.deviceId).toBeNull()
    expect(unassigned?.pilotName).toBeNull()
    expect(unassigned?.deviceSerialNumber).toBeNull()

    // nobody imported it either: a controller pushed it
    expect(unassigned?.importedByName).toBeNull()
  })

  it('lists a flight whose parse failed, with its status and its error readable', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    const failed = rows.find((row) => row.fileName === 'placeholder-flight-0003.txt')

    // a failed parse is still evidence that a flight happened. nothing in listFlights
    // filters on `parsing_status`, and this is the assertion that says so.
    expect(failed?.parsingStatus).toBe('failed')
    expect(failed?.parsingErrors).toBe('Placeholder parse failure.')
  })

  it('resolves the pilot, the airframe and the importer the acting session can read', async () => {
    const [imported] = await withTenant(harness.app, alphaSession(), listFlights)
    expect(imported?.pilotName).toBe('Alpha Pilot')
    expect(imported?.deviceSerialNumber).toBe('SN-ALPHA-0002')
    expect(imported?.importedByName).toBe('Alpha Manager')
  })

  it('reports a gap in `Predvolený pilot` rather than another operator pilot, and still lists the row', async () => {
    // the cell resting on a policy and not on a foreign key -
    // `person_shared_organization_or_self`. `pilot_id` carries no composite key, because
    // `person` has no organisation column, so this row is legal and a superadmin writes it.
    await withTenant(harness.app, superadminSession(), (tx) =>
      tx.insert(flight).values({
        organizationId: ids.organizations.alpha,
        fileName: 'placeholder-flight-under-a-foreign-pilot.txt',
        entryMode: 'manual',
        pilotId: ids.people.bravoManager,
      }),
    )

    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    const foreign = rows.find(
      (row) => row.fileName === 'placeholder-flight-under-a-foreign-pilot.txt',
    )
    expect(foreign?.pilotId).toBe(ids.people.bravoManager)
    expect(foreign?.pilotName).toBeNull()

    // put the tenant back the way the fixture had it, so the positional reads elsewhere stay
    // the fixture's own
    await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(flight).where(eq(flight.id, foreign?.id ?? 0)),
    )
  })

  it('counts only the legs the acting session can read, and counts none as none', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    expect(rows.map((row) => row.flightLogCount)).toEqual([2, 1, 0])

    // the flight with no legs is still in that list. a count of zero is a fact about the
    // flight, and an inner join would have dropped the row instead of stating it.
    expect(rows).toHaveLength(3)
  })
})

// the half that is not a policy. a plain references(device.id) would let each of these rows
// land: the row's own `organization_id` would be perfectly correct, and no policy on
// `flight` would notice.
describe('what the schema refuses, under a session whose policy refuses nothing', () => {
  it('rejects a flight naming another operator airframe', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(flight).values({
          organizationId: ids.organizations.alpha,
          fileName: 'placeholder-smuggled-flight.txt',
          entryMode: 'manual',
          deviceId: ids.airframes.bravoOne,
        }),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('flight_device_id_organization_id_fk')

    const landed = await harness.owner
      .select()
      .from(flight)
      .where(eq(flight.fileName, 'placeholder-smuggled-flight.txt'))
    expect(landed).toEqual([])
  })

  it('accepts a null airframe, because MATCH SIMPLE leaves the constraint unenforced', async () => {
    // the reason `device_id` may be nullable at all beside a composite foreign key, and so
    // the reason an unassigned flight is writable
    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    expect(rows[1]?.deviceId).toBeNull()
  })

  it('rejects a leg naming another operator flight', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(flightLog).values({
          flightId: ids.flights.bravoManual,
          organizationId: ids.organizations.alpha,
        }),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('flight_log_flight_id_organization_id_fk')
  })

  it('rejects the same reach from the other end, where the leg carries the foreign tenant', async () => {
    // naming bravo makes the flight half fail instead. the tenant travels with the flight,
    // so there is no organisation_id that makes this row legal
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(flightLog).values({
          flightId: ids.flights.alphaImported,
          organizationId: ids.organizations.bravo,
        }),
      ),
    )
    expect(refused.constraint_name).toBe('flight_log_flight_id_organization_id_fk')

    const landed = await harness.owner.select().from(flightLog)
    expect(landed).toHaveLength(3)
  })

  it('refuses deleting the person who imported a flight, even to a superadmin', async () => {
    // `imported_by` is `restrict`, so the record cannot lose the person who filed it.
    // Alpha Manager is named by no training, so the constraint that refuses is unambiguous
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.delete(person).where(eq(person.id, ids.people.alphaManager)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('flight_imported_by_person_id_fk')
  })
})

describe('what the flight schema itself decides: writes and deletes', () => {
  it('lets a member write a flight into their own organisation', async () => {
    await withTenant(harness.app, alphaSession(), (tx) =>
      tx.insert(flight).values({
        organizationId: ids.organizations.alpha,
        fileName: 'placeholder-flight-0005.txt',
        entryMode: 'manual',
      }),
    )

    const rows = await withTenant(harness.app, alphaSession(), listFlights)
    expect(rows.map((row) => row.fileName)).toContain('placeholder-flight-0005.txt')
  })

  it('refuses a write that names another organisation', async () => {
    // `device_id` is left null so the composite foreign key stays unenforced and the refusal
    // can only be the WITH CHECK
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(flight).values({
          organizationId: ids.organizations.bravo,
          fileName: 'placeholder-cross-tenant-flight.txt',
          entryMode: 'manual',
        }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const landed = await harness.owner
      .select()
      .from(flight)
      .where(eq(flight.fileName, 'placeholder-cross-tenant-flight.txt'))
    expect(landed).toEqual([])
  })

  it('refuses deleting an airframe a flight recorded, and allows one no flight recorded', async () => {
    // the airframe comment in src/lib/db/schema.ts says a dependent holding history must
    // restrict, or a member deletes the evidence with the row. a flight is that history.
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.delete(device).where(eq(device.id, ids.airframes.alphaTwo)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('flight_device_id_organization_id_fk')

    // and the other half, or a constraint that refused every airframe would pass this test.
    // a fresh one rather than a seeded one, because both seeded alpha airframes now carry
    // history of one kind or the other
    const [spare] = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .insert(device)
        .values({ organizationId: ids.organizations.alpha, serialNumber: 'SN-ALPHA-0009' })
        .returning({ id: device.id }),
    )
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(device)
        .where(eq(device.id, spare?.id ?? 0))
        .returning({ id: device.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('deletes the legs with the flight, and neither the airframe nor the pilot', async () => {
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(flight)
        .where(eq(flight.id, ids.flights.alphaImported))
        .returning({ id: flight.id }),
    )
    expect(removed).toHaveLength(1)

    const legs = await harness.owner
      .select()
      .from(flightLog)
      .where(eq(flightLog.flightId, ids.flights.alphaImported))
    expect(legs).toEqual([])

    const airframes = await harness.owner
      .select()
      .from(device)
      .where(eq(device.id, ids.airframes.alphaTwo))
    expect(airframes).toHaveLength(1)
  })
})
