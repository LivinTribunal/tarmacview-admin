import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IndexTable } from '@/components/index-table'
import { mayManagePeople } from '@/lib/auth/capabilities'
import { membership, person } from '@/lib/db/schema'
import { t } from '@/lib/i18n'
import { findPerson, listPeople } from '@/lib/tenant/scoped-people'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { personTable, personTableRow } from '@/lib/users/fields'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the register the shared-organisation policy was built for, proved end to end: listPeople
// under a real session, through the same chrome the page renders, asserted on the markup.
// tests/tenancy/shared-organization-policy.test.ts proves the policies; this proves that
// the register's own join, aggregate and grouping do not reach past them.
//
// it fails if scoped-people.ts grows a filter that widens the read, if the join reaches
// around the policy, or if an aggregate pulls a row the policy excluded - which is the
// property the whole register rests on.

let harness: TestDatabase
let ids: SeededIds

// a pilot flying for both operators, built here rather than in tests/support/fixtures.ts
// for the reason shared-organization-policy.test.ts builds one: a second person inside
// Operator Alpha changes what every other suite counts, and this case is this file's
// subject rather than a property of the fixture set.
let sharedPilot: number

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)

  const [pilot] = await harness.owner
    .insert(person)
    .values({ name: 'Shared Pilot', email: null })
    .returning({ id: person.id })
  if (!pilot) throw new Error('fixture row was not inserted')
  sharedPilot = pilot.id

  await harness.owner.insert(membership).values([
    { personId: pilot.id, organizationId: ids.organizations.alpha, role: 'pilot' },
    { personId: pilot.id, organizationId: ids.organizations.bravo, role: 'operations' },
  ])
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

const alphaSession: () => TenantSession = () => ({
  personId: ids.people.alphaManager,
  systemRole: 'member',
})
const bravoSession: () => TenantSession = () => ({
  personId: ids.people.bravoManager,
  systemRole: 'member',
})
const superadminSession: () => TenantSession = () => ({
  personId: ids.people.systemAdmin,
  systemRole: 'superadmin',
})

// the chrome never queries: it is handed the rows a scoped read returned. so this markup is
// exactly what the session was allowed to see, and nothing downstream of withTenant can
// widen it.
async function renderRegister(session: TenantSession): Promise<string> {
  const entries = await withTenant(harness.app, session, listPeople)
  return renderToStaticMarkup(
    createElement(IndexTable, {
      declaration: personTable(mayManagePeople(session.systemRole)),
      rows: entries.map(personTableRow),
    }),
  )
}

describe('the people register over a scoped read', () => {
  it('shows a member the people they share an organisation with', async () => {
    const markup = await renderRegister(alphaSession())

    expect(markup).toContain('Alpha Manager')
    expect(markup).toContain('Alpha Pilot')
  })

  it('shows them nobody who belongs only to the other operator', async () => {
    const markup = await renderRegister(alphaSession())

    expect(markup).not.toContain('Bravo Manager')
    expect(markup).not.toContain('Operator Bravo')
  })

  it('shows the other operator their own, which is the half that makes the first mean something', async () => {
    const markup = await renderRegister(bravoSession())

    expect(markup).toContain('Bravo Manager')
    expect(markup).not.toContain('Alpha Manager')
    expect(markup).not.toContain('Alpha Pilot')
  })

  it('shows a superadmin every person, so the exclusions above are the policy and not the markup', async () => {
    const markup = await renderRegister(superadminSession())

    expect(markup).toContain('Alpha Manager')
    expect(markup).toContain('Bravo Manager')
    expect(markup).toContain('Shared Pilot')
  })
})

// the case a sees-more-than-before test passes while broken, and the one the issue's title
// means by "shared memberships".
describe('the person two operators share', () => {
  it('appears to a member of alpha, named as alpha and nothing else', async () => {
    const markup = await renderRegister(alphaSession())

    expect(markup).toContain('Shared Pilot')
    expect(markup).toContain('Operator Alpha')
    // the register would otherwise leak the existence of another operator, and its
    // staffing, through the one row that reaches across the boundary
    expect(markup).not.toContain('Operator Bravo')
  })

  it('carries only the role they hold in alpha, not the one they hold in bravo', async () => {
    const [entry] = (await withTenant(harness.app, alphaSession(), listPeople)).filter(
      (row) => row.id === sharedPilot,
    )

    expect(entry?.roles).toEqual(['pilot'])
    expect(entry?.organizations).toEqual(['Operator Alpha'])
  })

  it('carries both attachments for a superadmin, in one shared order across the two cells', async () => {
    const [entry] = (await withTenant(harness.app, superadminSession(), listPeople)).filter(
      (row) => row.id === sharedPilot,
    )

    // element *n* of each describes the same membership, which is what lets the register
    // render two aligned cells instead of one collapsed pairing
    expect(entry?.organizations).toEqual(['Operator Alpha', 'Operator Bravo'])
    expect(entry?.roles).toEqual(['pilot', 'operations'])
  })
})

describe('a person with no membership at all', () => {
  it('is invisible to a member, because authority comes from a shared organisation', async () => {
    const markup = await renderRegister(alphaSession())
    expect(markup).not.toContain('System Administrator')
  })

  it('is visible to the superadmin, who is the only one who can see them', async () => {
    // the left join is what keeps them in: dropping a membership-less person would hide
    // them from the one session that can administer them
    const entries = await withTenant(harness.app, superadminSession(), listPeople)
    const admin = entries.find((row) => row.id === ids.people.systemAdmin)

    expect(admin?.name).toBe('System Administrator')
    expect(admin?.organizations).toBeNull()
    expect(admin?.roles).toBeNull()
  })

  it('renders with blank cells rather than dropping out of the superadmin register', async () => {
    const markup = await renderRegister(superadminSession())

    expect(markup).toContain('System Administrator')
    expect(markup).toContain(t('table.blank'))
  })
})

describe('the register beyond the rows', () => {
  it('yields not-found for a person outside the acting session organisations, not a refusal', async () => {
    const visible = await withTenant(harness.app, alphaSession(), (tx) =>
      findPerson(tx, ids.people.alphaPilot),
    )
    const across = await withTenant(harness.app, alphaSession(), (tx) =>
      findPerson(tx, ids.people.bravoManager),
    )

    expect(visible?.name).toBe('Alpha Pilot')
    // no row rather than an error: refusing would confirm the person is real
    expect(across).toBeNull()
  })

  it('prints a pilot certificate number and leaves an unrecorded one blank', async () => {
    const entries = await withTenant(harness.app, alphaSession(), listPeople)
    const pilot = entries.find((row) => row.id === ids.people.alphaPilot)
    const manager = entries.find((row) => row.id === ids.people.alphaManager)

    expect(pilot?.certificateNumber).toBe('CERT-PLACEHOLDER-0001')
    expect(pilot?.certificateTypes).toEqual(['A1_A3', 'A2'])
    // no certificate recorded, which is a gap and never a pass
    expect(manager?.certificateNumber).toBeNull()
    expect(manager?.certificateTypes).toEqual([])
  })

  it('keeps a pilot with no e-mail in the register, blank rather than absent', async () => {
    const markup = await renderRegister(alphaSession())

    expect(markup).toContain('Alpha Pilot')
    expect(markup).toContain(t('table.blank'))
  })

  it('offers a member no `Upraviť`, because the database would refuse the write', async () => {
    const markup = await renderRegister(alphaSession())
    expect(markup).not.toContain(t('table.actions'))
  })

  it('offers a superadmin one, because they can complete it', async () => {
    const markup = await renderRegister(superadminSession())
    expect(markup).toContain(t('table.actions'))
    expect(markup).toContain(t('table.action.edit'))
  })

  // the header action moved into the shared chrome, so the gate is asserted on the markup
  // rather than on the declaration: a declaration-level assertion passes just as well if
  // the chrome renders the link unconditionally, which is the failure this move risks.
  it('offers a member no `Vytvoriť`, because the database would refuse the insert', async () => {
    const markup = await renderRegister(alphaSession())
    expect(markup).not.toContain('/admin/users/create')
    expect(markup).not.toContain(t('table.action.create'))
  })

  it('offers a superadmin one, so the absence above is the gate and not the chrome', async () => {
    const markup = await renderRegister(superadminSession())
    expect(markup).toContain('/admin/users/create')
    expect(markup).toContain(t('table.action.create'))
  })
})

// the write authority this slice deliberately does not move - docs/specs/03-data-model.md
// §"The shared-organisation read in the rebuild". a member now reads rows they still may
// not touch, and #48 is where that gets decided rather than here.
describe('reading is not writing', () => {
  it('refuses a member creating a person', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(person).values({ name: 'Placeholder Intruder', email: null }),
      ),
    ).rejects.toThrow()
  })

  it('refuses a member renaming a co-member they can see', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.update(person).set({ name: 'Placeholder Rename' }),
      ),
    ).rejects.toThrow()
  })

  it('refuses a member attaching anyone to their own organisation', async () => {
    await expect(
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(membership).values({
          personId: sharedPilot,
          organizationId: ids.organizations.alpha,
          role: 'viewer',
        }),
      ),
    ).rejects.toThrow()
  })
})
