# 01 — Risk tiers for the TypeScript stack

`harness.config.json` is a protected file: agents must not modify it. This document is the
proposed replacement for its `riskTiers` patterns and `commands`, for a human to apply.

## Why it has to change before anything is built

The current patterns were written against the predecessor's fingerprint — Laravel. They
match `app/**`, `composer.json`, `database/migrations/**`, `resources/**`.

The rebuild is TypeScript. Under those patterns, almost nothing in the new tree matches
tier 2 or tier 3, and `riskTiers.tier1` includes `**/*.md` while `.harnext/contract.json`
falls through to `"low": ["**"]`. The practical consequence:

**Tenant-scoping and authorisation code would land as tier 1 — self-mergeable, zero
approvals, lint as the only gate.** That is precisely the failure the tiers exist to
prevent, and an autonomous loop would exploit it without ever intending to.

So this lands before the first line of application code, not after.

## Proposed `riskTiers`

Only `patterns` and `commands` change. `mergePolicy` and `evidenceRequirements` stay as
they are — the thresholds were right, they were just pointed at the wrong files.

### tier2 — application source, tests, build config

```json
"patterns": [
  "src/**",
  "app/**",
  "lib/**",
  "components/**",
  "server/**",
  "tests/**",
  "e2e/**",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "next.config.*",
  "vite.config.*",
  "vitest.config.*",
  "playwright.config.*",
  "tailwind.config.*"
]
```

### tier3 — isolation, authorisation, parsers, schema, and the test oracle

```json
"patterns": [
  "**/*polic*",
  "**/*permission*",
  "**/*authoriz*",
  "**/*authoris*",
  "**/auth/**",
  "**/*tenant*",
  "**/*scope*",
  "**/*parser*",
  "**/*import*",
  "**/middleware.ts",
  "**/migrations/**",
  "drizzle/**",
  "prisma/migrations/**",
  "prisma/schema.prisma",
  "contracts/**"
]
```

Three of these are additions rather than translations, and each has a reason:

**`**/middleware.ts`** — in a Next.js-shaped app this is where request-time authentication
and tenant resolution actually run. A file that decides who you are and which organisation
you are in belongs in the same tier as the policies it feeds.

**`contracts/**`** — the extracted route, form and report contracts are the test oracle.
An agent that can edit the oracle can make any failing test pass by weakening what it
asserts, and every gate downstream would still report green. Changing the oracle is a
human decision. This is the single most important addition on the list.

**`**/*import*`** is kept deliberately broad. It catches the flight-log ingestion paths,
and it will also catch unrelated files with "import" in the name. Over-matching into tier 3
costs an approval; under-matching costs an airworthiness record.

## Proposed `commands`

Currently `build` and `typeCheck` are `null`, so those required checks silently pass. That
is fine while the repo is documentation-only and wrong the moment code lands.

```json
"commands": {
  "lint": "bash scripts/check-conventions.sh && npm run lint",
  "test": "bash scripts/structural-tests.sh && npm run test",
  "build": "npm run build",
  "typeCheck": "npm run typecheck"
}
```

The two existing shell gates stay in front. They check things no TypeScript toolchain
knows about — personal data, AI attribution, confidence marking, spec reachability — and
they must not be displaced by the language toolchain arriving.

## Also needs a human

- **`.harnext/contract.json`** carries a parallel `riskTierRules` map with only `high` and
  `low`. Its `high` list is path-based and still correct (workflows, specs, scripts,
  `CLAUDE.md`), but `contracts/**` should be added there too.
- **`docs/specs/01-tech-stack.md`** currently recommends keeping Laravel and Filament as
  the cheapest path. That recommendation has been overridden by a decision to rebuild in
  TypeScript. The document should say so — the fingerprint section stays as Observed fact
  about the predecessor, the consequences section becomes a record of a decision taken
  against its advice, and why.
