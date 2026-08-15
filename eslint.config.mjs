import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

// .claude/ holds harness skill scripts, not application source
const config = [
  { ignores: ['.next/**', '.claude/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default config
