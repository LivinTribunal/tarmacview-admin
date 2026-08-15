import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/lib/db/schema'

export type Database = PostgresJsDatabase<typeof schema>

// postgres.js opens no socket until the first query runs, so importing this during a
// build with no DATABASE_URL set is safe - a missing url surfaces on the first request
// rather than at compile time.
export function createDatabase(connectionString = process.env.DATABASE_URL) {
  const client = postgres(connectionString ?? '', { max: 10 })
  return { client, db: drizzle(client, { schema }) as Database }
}

// the application connection. it must be a role with neither SUPERUSER nor BYPASSRLS:
// both skip every policy in drizzle/0001_force_rls_and_app_role.sql without changing
// anything visible in a schema dump.
export const { db } = createDatabase()
