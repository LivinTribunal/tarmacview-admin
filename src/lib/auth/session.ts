import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db, type Database } from '@/lib/db/client'
import { person } from '@/lib/db/schema'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'

// turns a signed-in request into the acting session every scoped read is run under.
// src/middleware.ts decides who gets as far as a page; this decides what the database
// is told about them, and the two are not the same boundary.
export async function actingSession(): Promise<TenantSession | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const personId = session?.user.personId
  if (typeof personId !== 'number') return null

  return resolveActingSession(db, personId)
}

// split from the request half so this one can be asserted without a request, which is
// also why it takes the connection rather than reaching for the module's own.
//
// the system role is read from the person record rather than taken from the session,
// and it is read under the narrowest context that can answer the question: a `member`
// context, whose policy on `person` admits the acting person's own row and no other.
// so a session that claimed to be a superadmin would not become one here, and a
// missing person record yields no session at all rather than a nameless one.
export async function resolveActingSession(
  connection: Database,
  personId: number,
): Promise<TenantSession | null> {
  const [row] = await withTenant(connection, { personId, systemRole: 'member' }, (tx) =>
    tx
      .select({ systemRole: person.systemRole })
      .from(person)
      .where(eq(person.id, personId))
      .limit(1),
  )

  return row ? { personId, systemRole: row.systemRole } : null
}
