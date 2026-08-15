import { sql } from 'drizzle-orm'
import type { Database } from '@/lib/db/client'
import type { SystemRole } from '@/lib/db/schema'

export type TenantSession = {
  personId: number
  systemRole: SystemRole
}

export type TenantTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

// the acting session, handed to the database as the two settings every policy reads.
// set_config's third argument is `is_local`: the values live for the transaction and
// nothing longer, so a pooled connection cannot carry one tenant's context into the
// next checkout.
//
// every read of an organisation-owned entity goes through here. that is the whole
// scoping mechanism - there is no per-query organisation filter to forget.
export async function withTenant<T>(
  db: Database,
  session: TenantSession,
  run: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.person_id', ${String(session.personId)}, true),
      set_config('app.system_role', ${session.systemRole}, true)`)
    return run(tx)
  })
}
