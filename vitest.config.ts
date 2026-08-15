import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

// the same jsx runtime next compiles with. tsconfig says `preserve` because next owns
// the transform there; esbuild left to itself picks the classic runtime and a rendered
// component fails on a global `React` nothing imports.
const jsx = { jsx: 'automatic' } as const

// two projects, because the suites that need a real Postgres start one and the contract
// and domain suites must not pay for it. neither project may skip: a tenant-isolation
// test that silently does not run is a green build proving nothing.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        esbuild: jsx,
        test: {
          name: 'unit',
          include: ['tests/contracts/**/*.test.ts', 'tests/domain/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        esbuild: jsx,
        test: {
          name: 'database',
          include: ['tests/tenancy/**/*.test.ts', 'tests/auth/**/*.test.ts'],
          // pulling and starting the container is the slow part, and it happens once
          hookTimeout: 300_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
