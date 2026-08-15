import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

// two projects, because the tenancy suite starts a real Postgres and the contract and
// domain suites must not pay for it. neither project may skip: a tenant-isolation test
// that silently does not run is a green build proving nothing.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/contracts/**/*.test.ts', 'tests/domain/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'database',
          include: ['tests/tenancy/**/*.test.ts'],
          // pulling and starting the container is the slow part, and it happens once
          hookTimeout: 300_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
