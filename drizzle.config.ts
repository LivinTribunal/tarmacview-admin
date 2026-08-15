import { defineConfig } from 'drizzle-kit'

// generate only - migrations are applied by the deployment and, in tests, by
// tests/support/database.ts, so nothing here needs a live connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
