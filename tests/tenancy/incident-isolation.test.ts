import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { flight, incident } from '@/lib/db/schema'
import { findIncident, listOrganizationIncidents } from '@/lib/tenant/scoped-incidents'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the occurrence register - docs/specs/03-data-model.md §"Incidents in the rebuild". an
// occurrence report is compliance evidence, so this file carries three different claims: the
// ordinary policy scoping every register here has, the one that is not a policy at all -
// that an incident naming another operator's flight is refused by the foreign key - and the
// one the schema states by leaving a boolean nullable.
//
// the foreign-key half runs under a **superadmin** session, whose policy admits every row,
// so the constraint is the only thing left that can refuse it. downgrade the composite
// foreign key to a plain one and those cases go red while every read below stays green,
// which is precisely the failure mode they guard.
//
// everything runs through harness.app and nothing through harness.owner except the read-back
// checks: a missing GRANT on the table or on its sequence surfaces as `permission denied` on
// the first member read or the first member insert rather than as a puzzle later. `incident`
// is created long after 0001, so its schema-wide grant does not reach it.

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

// no deployment-wide occurrence register exists - doc 04 lists thirteen resources and none
// of them is this one - so the read with no organisation clause is written out here rather
// than exported from src/ for one caller. what it proves is the policy: drop
// `incident_tenant_isolation` and this returns the whole deployment.
const listEveryIncident = (session: TenantSession) =>
  withTenant(harness.app, session, (tx) => tx.select().from(incident).orderBy(incident.id))

describe('tenant isolation: the occurrence register under a member session', () => {
  it('an unscoped read returns only the acting tenant rows', async () => {
    const rows = await listEveryIncident(alphaSession())
    expect(rows.map((row) => row.title)).toEqual([
      'Placeholder Occurrence With Injury',
      'Placeholder Occurrence Without Injury',
      'Placeholder Occurrence Unanswered',
    ])
  })

  it('the other tenant sees its own, which is the half that makes the first mean something', async () => {
    const rows = await listEveryIncident(bravoSession())
    expect(rows.map((row) => row.title)).toEqual(['Placeholder Bravo Occurrence'])
  })

  it('a superadmin reaches both, so the two exclusions above are the policy and not an empty read', async () => {
    const rows = await listEveryIncident(superadminSession())
    expect(rows).toHaveLength(4)
  })

  it('finds an occurrence report of the acting tenant by id', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findIncident(tx, ids.incidents.alphaInjury),
    )
    expect(found?.title).toBe('Placeholder Occurrence With Injury')
  })

  it('a cross-tenant id returns not-found rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findIncident(tx, ids.incidents.bravoReport),
    )
    // null, not a throw and not a refusal: refusing would confirm the row exists
    expect(found).toBeNull()
  })

  it('lists the tab for the organisation being looked at, and nothing of the other operator', async () => {
    const rows = await withTenant(harness.app, alphaSession(), (tx) =>
      listOrganizationIncidents(tx, ids.organizations.alpha),
    )
    expect(rows.map((row) => row.title)).not.toContain('Placeholder Bravo Occurrence')
    expect(rows).toHaveLength(3)
  })

  it('names the linked flight and leaves the unlinked ones a gap, in one read', async () => {
    // the left join is what keeps an incident naming no flight in the result at all, and
    // doc 05 §6 calls that link *optional* - so the gap is the normal row here
    const rows = await withTenant(harness.app, alphaSession(), (tx) =>
      listOrganizationIncidents(tx, ids.organizations.alpha),
    )
    expect(rows.map((row) => row.flightFileName)).toEqual([
      'placeholder-flight-0003.txt',
      null,
      null,
    ])
  })
})

describe('the answer a nullable boolean can carry and a `not null default false` one cannot', () => {
  it('keeps yes, an answered no and nobody answering as three different values', async () => {
    // the exception docs/specs/05-organization-workspace.md records beside its
    // affirmative-only rule. make this column `not null default false` and the third row
    // stops being writable at all - the fixture insert fails before any assertion runs -
    // while a `false` default would silently turn *nobody answered* into *nobody was hurt*
    // on the one record where that is the question.
    const rows = await listEveryIncident(alphaSession())
    expect(rows.map((row) => row.injuries)).toEqual([true, false, null])
  })
})

describe('what the schema refuses, under a session whose policy refuses nothing', () => {
  it('rejects an occurrence report naming another operator flight', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(incident).values({
          organizationId: ids.organizations.alpha,
          title: 'Placeholder Smuggled Occurrence',
          description: 'Placeholder occurrence description.',
          incidentDate: '2026-07-01',
          flightId: ids.flights.bravoManual,
        }),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('incident_flight_id_organization_id_fk')

    const landed = await harness.owner
      .select()
      .from(incident)
      .where(eq(incident.title, 'Placeholder Smuggled Occurrence'))
    expect(landed).toEqual([])
  })

  it('rejects the same reach from the other end, where the report carries the foreign tenant', async () => {
    // naming bravo makes the flight half fail instead. the tenant travels with the flight,
    // so there is no organisation_id that makes this row legal
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(incident).values({
          organizationId: ids.organizations.bravo,
          title: 'Placeholder Smuggled Occurrence',
          description: 'Placeholder occurrence description.',
          incidentDate: '2026-07-01',
          flightId: ids.flights.alphaFailed,
        }),
      ),
    )
    expect(refused.constraint_name).toBe('incident_flight_id_organization_id_fk')
  })
})

describe('what the occurrence schema itself decides: writes and deletes', () => {
  it('lets a member file a report naming no flight, and lists it normally', async () => {
    // the MATCH SIMPLE case, and the reason it is wanted: doc 05 §6 calls the link optional,
    // so a null leaves the composite foreign key unenforced rather than failing. this insert
    // is also what exercises the sequence GRANT - a missing one fails here on nextval.
    await withTenant(harness.app, alphaSession(), (tx) =>
      tx.insert(incident).values({
        organizationId: ids.organizations.alpha,
        title: 'Placeholder Unlinked Occurrence',
        description: 'Placeholder occurrence description.',
        incidentDate: '2026-07-20',
      }),
    )

    const rows = await withTenant(harness.app, alphaSession(), (tx) =>
      listOrganizationIncidents(tx, ids.organizations.alpha),
    )
    const filed = rows.find((row) => row.title === 'Placeholder Unlinked Occurrence')
    expect(filed?.flightId).toBeNull()
    expect(filed?.flightFileName).toBeNull()

    // and no injury answer either, which is a third thing again from an answered no
    expect(filed?.injuries).toBeNull()
  })

  it('refuses a write that names another organisation', async () => {
    // `flight_id` is left null so the composite foreign key stays unenforced and the refusal
    // can only be the WITH CHECK
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(incident).values({
          organizationId: ids.organizations.bravo,
          title: 'Placeholder Cross-Tenant Occurrence',
          description: 'Placeholder occurrence description.',
          incidentDate: '2026-07-21',
        }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const landed = await harness.owner
      .select()
      .from(incident)
      .where(eq(incident.title, 'Placeholder Cross-Tenant Occurrence'))
    expect(landed).toEqual([])
  })

  it('refuses deleting a flight an occurrence report names, and allows one no report names', async () => {
    // an incident naming a flight is exactly the evidence the flight's other dependents
    // restrict to protect, so it restricts too - `set null` would leave the report standing
    // with no way back to what it reports on.
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.delete(flight).where(eq(flight.id, ids.flights.alphaFailed)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('incident_flight_id_organization_id_fk')

    // and the other half, or a constraint that refused every flight would pass this test.
    // `alphaUnassigned` names no airframe and no report, so nothing else can be what allows it
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(flight)
        .where(eq(flight.id, ids.flights.alphaUnassigned))
        .returning({ id: flight.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('lets the owning tenant delete its own report, which no restrictive policy narrows', async () => {
    // an occurrence report is the operator's own record and deleting one is the same
    // authority as writing one - docs/specs/03-data-model.md §"Delete authority in the
    // rebuild", the row `flight` and `training` already sit on
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(incident)
        .where(eq(incident.id, ids.incidents.alphaUnanswered))
        .returning({ id: incident.id }),
    )
    expect(removed).toHaveLength(1)

    const survivors = await harness.owner
      .select()
      .from(incident)
      .where(eq(incident.id, ids.incidents.alphaUnanswered))
    expect(survivors).toEqual([])
  })

  it('refuses a member deleting the other operator report, and leaves it standing', async () => {
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(incident)
        .where(eq(incident.id, ids.incidents.bravoReport))
        .returning({ id: incident.id }),
    )
    expect(removed).toEqual([])

    // read back through the RLS-exempt owner connection: the member's own read is scoped, so
    // an empty read there would prove nothing about whether the row survived
    const survivors = await harness.owner
      .select()
      .from(incident)
      .where(eq(incident.id, ids.incidents.bravoReport))
    expect(survivors).toHaveLength(1)
  })
})
