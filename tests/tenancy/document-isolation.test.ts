import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { document, organization, person } from '@/lib/db/schema'
import { findGeneralDocument, listGeneralDocuments } from '@/lib/tenant/scoped-documents'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the first table in the rebuild deliberately readable across tenants -
// docs/specs/03-data-model.md §"The global document library in the rebuild". every other
// register here answers one question, *is this row's organisation one of mine*, and on every
// other table `USING` and `WITH CHECK` are equal because that is the correct answer.
//
// here they are not, and the difference is invisible in the code. so the tests that hold it
// up say in their own names what breaks them: an editor tidying `WITH CHECK` to match
// `USING`, and an editor deleting either restrictive policy as "already covered". both leave
// every read below green.

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
// "something refused this" and "the CHECK refused this".
type Refusal = { code?: string; constraint_name?: string; message?: string }

async function refusal(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run()
  } catch (error) {
    return ((error as { cause?: Refusal }).cause ?? {}) as Refusal
  }
  throw new Error('the statement was not refused')
}

const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

// a global row, written the only way one may be: through a superadmin session. the tests
// that destroy a row build their own rather than spending a fixture, so the reads above them
// stay the fixture's own.
const publishGlobal = (name: string) =>
  withTenant(harness.app, superadminSession(), (tx) =>
    tx
      .insert(document)
      .values({
        organizationId: null,
        category: 'general',
        name,
        filePath: 'general-documents/placeholder-throwaway.pdf',
      })
      .returning({ id: document.id }),
  ).then(([row]) => row?.id ?? 0)

const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name).sort()

describe('tenant isolation: the global library, readable by every session', () => {
  it('a member reads the global documents and their own bucket, and neither another operator', async () => {
    const rows = await withTenant(harness.app, alphaSession(), (tx) => tx.select().from(document))
    expect(names(rows)).toEqual([
      'Alpha Operations Manual',
      'Placeholder Operations Manual Template',
      'Placeholder Reporting Form Template',
    ])
  })

  it('the other operator reads the same two global documents and its own, which is the half that makes the first mean something', async () => {
    const rows = await withTenant(harness.app, bravoSession(), (tx) => tx.select().from(document))
    expect(names(rows)).toEqual([
      'Bravo Occurrence Form',
      'Placeholder Operations Manual Template',
      'Placeholder Reporting Form Template',
    ])
  })

  it('a superadmin reaches every bucket of every operator, so the two exclusions above are the policy and not an empty table', async () => {
    const rows = await withTenant(harness.app, superadminSession(), (tx) =>
      tx.select().from(document),
    )
    expect(rows).toHaveLength(4)
  })

  it('reads nothing at all from a connection with no tenant context, the global rows included', async () => {
    // the null branch of `USING` asks for an acting person as well as for the null, so the
    // invariant tests/tenancy/airframe-isolation.test.ts asserts for `device` holds here
    // too. drop that clause and the library becomes readable by a connection that is
    // nobody - which is not a session, and *readable by every session* is the claim.
    const rows = await harness.app.select().from(document)
    expect(rows).toEqual([])
  })
})

describe('the register reads one bucket, and the policy reads the tenant', () => {
  it('lists the global bucket and not the acting tenant own documents', async () => {
    const rows = await withTenant(harness.app, alphaSession(), listGeneralDocuments)
    expect(rows.map((row) => row.name)).toEqual([
      'Placeholder Operations Manual Template',
      'Placeholder Reporting Form Template',
    ])
  })

  it('reports a gap in `Nahral` where the session cannot read the uploader, and still lists the document', async () => {
    const [manual, form] = await withTenant(harness.app, alphaSession(), listGeneralDocuments)

    // the library is published by a superadmin, who holds no membership at all - so
    // `person_shared_organization_or_self` does not admit them to a member's read and the
    // cell is a gap. that is the normal case for this register rather than an edge one, and
    // the left join is what keeps the document listed instead of dropping it for want of a
    // name.
    expect(manual?.uploadedBy).toBe(ids.people.systemAdmin)
    expect(manual?.uploadedByName).toBeNull()

    // and the row naming nobody at all reports the same gap for the other reason
    expect(form?.uploadedBy).toBeNull()
    expect(form?.uploadedByName).toBeNull()
  })

  it('resolves the uploader for a session that can read them, or the gap above would only be a broken join', async () => {
    const [manual] = await withTenant(harness.app, superadminSession(), listGeneralDocuments)
    expect(manual?.uploadedByName).toBe('System Administrator')
  })

  it('finds a global document by id under a member session', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findGeneralDocument(tx, ids.documents.globalManual),
    )
    expect(found?.name).toBe('Placeholder Operations Manual Template')
    expect(found?.organizationId).toBeNull()
  })

  it('answers not-found for the acting tenant own document in another bucket', async () => {
    // readable, and still not this register's: the route over this read serves the library
    // and a permit fetched through it would make it the generic file route doc 03 refuses
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findGeneralDocument(tx, ids.documents.alphaOperations),
    )
    expect(found).toBeNull()
  })

  it('answers not-found for another operator document rather than forbidden', async () => {
    const found = await withTenant(harness.app, alphaSession(), (tx) =>
      findGeneralDocument(tx, ids.documents.bravoForm),
    )
    expect(found).toBeNull()
  })
})

describe('the asymmetry: USING admits a null organisation and WITH CHECK must not', () => {
  it('refuses a member publishing into the global library, and tidying WITH CHECK to match USING is what breaks this', async () => {
    // the whole slice. `null in (select app_acting_organizations())` is null and not true,
    // so the member fails the check - but only while the check has no null branch of its
    // own. give it one, and any member publishes a document into every operator's library
    // in the deployment with every read above still green.
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(document).values({
          organizationId: null,
          category: 'general',
          name: 'Placeholder Smuggled Template',
          filePath: 'general-documents/placeholder-smuggled.pdf',
        }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)

    const landed = await harness.owner
      .select()
      .from(document)
      .where(eq(document.name, 'Placeholder Smuggled Template'))
    expect(landed).toEqual([])
  })

  it('refuses a member writing into another operator bucket', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, alphaSession(), (tx) =>
        tx.insert(document).values({
          organizationId: ids.organizations.bravo,
          category: 'forms',
          name: 'Placeholder Cross Tenant Form',
          filePath: 'forms/placeholder-cross-tenant.pdf',
        }),
      ),
    )
    expect(refused.message).toMatch(/row-level security policy/)
  })

  it('lets a member write into their own bucket, so neither refusal above is a policy of false', async () => {
    const [written] = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .insert(document)
        .values({
          organizationId: ids.organizations.alpha,
          category: 'forms',
          name: 'Placeholder Alpha Form',
          filePath: 'forms/placeholder-alpha-form.pdf',
        })
        .returning({ id: document.id }),
    )
    expect(written?.id).toBeGreaterThan(0)

    // and put the fixture back, so the reads at the top of this file stay the fixture's own
    const removed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .delete(document)
        .where(eq(document.id, written?.id ?? 0))
        .returning({ id: document.id }),
    )
    expect(removed).toHaveLength(1)
  })
})

describe('the restrictive policies: Postgres decides UPDATE and DELETE by USING alone', () => {
  it('refuses a member deleting a global document, and deleting document_global_delete_superadmin_only is what breaks this', async () => {
    // #42 exactly. the permissive policy's null branch makes the row visible to a member's
    // DELETE, and there is no WITH CHECK for a delete to stop it - only a *restrictive*
    // policy beside it can, because permissive policies OR together.
    const published = await publishGlobal('Placeholder Retired Template')

    const refused = await withTenant(harness.app, alphaSession(), (tx) =>
      tx.delete(document).where(eq(document.id, published)).returning({ id: document.id }),
    )
    // a restrictive policy filters the rows the statement matches, so the refusal is an
    // empty result rather than a throw
    expect(refused).toEqual([])

    // read back through the RLS-exempt owner connection: a member's own read is scoped, so
    // an empty read there would prove nothing about whether the row survived
    const survivors = await harness.owner
      .select()
      .from(document)
      .where(eq(document.id, published))
    expect(survivors).toHaveLength(1)

    const removed = await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(document).where(eq(document.id, published)).returning({ id: document.id }),
    )
    expect(removed).toHaveLength(1)
  })

  it('refuses a member capturing a global document into their own organisation, and deleting document_global_update_superadmin_only is what breaks this', async () => {
    // the update no WITH CHECK could have stopped: the new row would carry the member's own
    // organisation, which the check admits, and the library would have lost the document.
    // UPDATE is decided by USING the same way DELETE is.
    const captured = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .update(document)
        .set({ organizationId: ids.organizations.alpha, category: 'forms' })
        .where(eq(document.id, ids.documents.globalManual))
        .returning({ id: document.id }),
    )
    expect(captured).toEqual([])

    const [survivor] = await harness.owner
      .select()
      .from(document)
      .where(eq(document.id, ids.documents.globalManual))
    expect(survivor?.organizationId).toBeNull()
    expect(survivor?.category).toBe('general')
  })

  it('refuses a member editing a global document in place, and the restrictive policy is what gets there first', async () => {
    // the pair to the capture above. an edit that leaves the organisation null would fail
    // `WITH CHECK` on its own - `null in (…)` is null - so this one is refused twice over,
    // and the capture is refused only by the policy this describe is about. what both look
    // like from here is a statement that matched no rows.
    const defaced = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .update(document)
        .set({ name: 'Placeholder Defaced Template' })
        .where(eq(document.id, ids.documents.globalManual))
        .returning({ id: document.id }),
    )
    expect(defaced).toEqual([])

    const [survivor] = await harness.owner
      .select()
      .from(document)
      .where(eq(document.id, ids.documents.globalManual))
    expect(survivor?.name).toBe('Placeholder Operations Manual Template')
  })

  it('lets a member edit in their own bucket, so none of the three refusals above is a policy of false', async () => {
    // the delete half of the same authority is asserted where a member's own row is written
    // and removed again, above
    const renamed = await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .update(document)
        .set({ name: 'Alpha Operations Manual, revised' })
        .where(eq(document.id, ids.documents.alphaOperations))
        .returning({ id: document.id }),
    )
    expect(renamed).toHaveLength(1)

    // and put the fixture back, so the reads at the top of this file stay the fixture's own
    await withTenant(harness.app, alphaSession(), (tx) =>
      tx
        .update(document)
        .set({ name: 'Alpha Operations Manual' })
        .where(eq(document.id, ids.documents.alphaOperations)),
    )
  })

  it('lets a superadmin publish into the library, which is what a deployment-wide library means', async () => {
    const published = await publishGlobal('Placeholder Published Template')
    expect(published).toBeGreaterThan(0)

    const readable = await withTenant(harness.app, alphaSession(), (tx) =>
      findGeneralDocument(tx, published),
    )
    expect(readable?.name).toBe('Placeholder Published Template')

    await withTenant(harness.app, superadminSession(), (tx) =>
      tx.delete(document).where(eq(document.id, published)),
    )
  })
})

describe('what the CHECK refuses, under a session whose policy refuses nothing', () => {
  // every case here runs as a superadmin, whose policy admits every row, so the constraint
  // is the only thing left that can refuse it. the fixtures are the other half: two global
  // rows and two tenant-owned ones seeded without complaint, so the constraint admits both
  // legal pairs rather than refusing everything.

  it('refuses a general document that names an organisation', async () => {
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(document).values({
          organizationId: ids.organizations.alpha,
          category: 'general',
          name: 'Placeholder Owned Template',
          filePath: 'general-documents/placeholder-owned.pdf',
        }),
      ),
    )
    expect(refused.code).toBe(CHECK_VIOLATION)
    expect(refused.constraint_name).toBe('document_general_is_global')
  })

  it('refuses a bucket document with no organisation, which is the other direction of the same constraint', async () => {
    // a one-way constraint - *general implies null* alone - passes the case above and lets
    // this one through, leaving an ownerless permit no register lists and no policy scopes
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.insert(document).values({
          organizationId: null,
          category: 'permits',
          name: 'Placeholder Ownerless Permit',
          filePath: 'permits/placeholder-ownerless.pdf',
        }),
      ),
    )
    expect(refused.code).toBe(CHECK_VIOLATION)
    expect(refused.constraint_name).toBe('document_general_is_global')
  })

  it('refuses moving a global document into an organisation, which is the layer under the capture above', async () => {
    // the restrictive policy refuses a *member* this edit. the constraint refuses it to
    // everybody, so the capture stays impossible even if that policy is ever narrowed - and
    // this is the only case here where the CHECK is what a superadmin runs into.
    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx
          .update(document)
          .set({ organizationId: ids.organizations.alpha })
          .where(eq(document.id, ids.documents.globalManual)),
      ),
    )
    expect(refused.code).toBe(CHECK_VIOLATION)
    expect(refused.constraint_name).toBe('document_general_is_global')
  })

})

describe('what a document refuses to be deleted out from under', () => {
  it('refuses deleting the organisation a document belongs to', async () => {
    // `restrict`, for the reason the airframe's and the flight's are: an operator's
    // compliance pack is evidence, and a cascade would take it with the tenant
    const [tenant] = await harness.owner
      .insert(organization)
      .values({ name: 'Operator Foxtrot', reportToken: 'report-token-foxtrot' })
      .returning({ id: organization.id })
    await harness.owner.insert(document).values({
      organizationId: tenant?.id,
      category: 'forms',
      name: 'Placeholder Foxtrot Form',
      filePath: 'forms/placeholder-foxtrot.pdf',
    })

    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.delete(organization).where(eq(organization.id, tenant?.id ?? 0)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('document_organization_id_organization_id_fk')
  })

  it('refuses deleting the person who uploaded a document', async () => {
    // the same promise `flight.imported_by` keeps: the record cannot lose the person who
    // filed it. a person of its own, so the constraint that refuses is unambiguous
    const [uploader] = await harness.owner
      .insert(person)
      .values({ name: 'Foxtrot Uploader', email: null })
      .returning({ id: person.id })
    await harness.owner.insert(document).values({
      organizationId: null,
      category: 'general',
      name: 'Placeholder Uploaded Template',
      filePath: 'general-documents/placeholder-uploaded.pdf',
      uploadedBy: uploader?.id,
    })

    const refused = await refusal(() =>
      withTenant(harness.app, superadminSession(), (tx) =>
        tx.delete(person).where(eq(person.id, uploader?.id ?? 0)),
      ),
    )
    expect(refused.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(refused.constraint_name).toBe('document_uploaded_by_person_id_fk')
  })
})
