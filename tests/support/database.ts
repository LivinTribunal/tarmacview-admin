import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { createDatabase, type Database } from '@/lib/db/client'

// a real Postgres, because what is under test is Postgres role and policy behaviour.
// an in-process stand-in would be testing the stand-in. there is deliberately no skip
// path: if no container engine is reachable the suite fails, since a tenant-isolation
// test that quietly does not run is a green build proving nothing.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// a throwaway login role inside the group role the migration creates. it inherits the
// group's grants and, like it, is no superuser and holds no BYPASSRLS.
export const APP_LOGIN_ROLE = 'tarmacview_app_test'
const APP_LOGIN_PASSWORD = 'placeholder-test-password'

export type TestDatabase = {
  // connects as the application role, subject to every policy
  app: Database
  // connects as the container superuser, exempt from row-level security, for seeding
  owner: Database
  stop: () => Promise<void>
}

function migrationSql(): string[] {
  const journal = JSON.parse(
    readFileSync(join(repoRoot, 'drizzle/meta/_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string }[] }

  return journal.entries
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(join(repoRoot, `drizzle/${entry.tag}.sql`), 'utf8'))
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()

  const admin = postgres(container.getConnectionUri(), { max: 1 })
  for (const sql of migrationSql()) await admin.unsafe(sql).simple()
  await admin.unsafe(
    `CREATE ROLE "${APP_LOGIN_ROLE}" LOGIN PASSWORD '${APP_LOGIN_PASSWORD}' IN ROLE tarmacview_app`,
  )
  await admin.end()

  const appUri = `postgres://${APP_LOGIN_ROLE}:${APP_LOGIN_PASSWORD}@${container.getHost()}:${container.getPort()}/${container.getDatabase()}`
  const app = createDatabase(appUri)
  const owner = createDatabase(container.getConnectionUri())

  return {
    app: app.db,
    owner: owner.db,
    stop: async () => {
      await app.client.end()
      await owner.client.end()
      await container.stop()
    },
  }
}
