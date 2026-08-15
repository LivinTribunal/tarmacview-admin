# 01 — Risk tiers for the TypeScript stack

`harness.config.json` is a protected file: agents must not modify it unasked. The tier
patterns below were **applied on explicit instruction from the repository owner**, which is
what the protection is for — a human authorising a change, rather than an agent deciding to
make one. `check-conventions.sh` records it as a warning on the diff, and that warning is
the intended signal, not noise to be cleared.

This document is the record of what changed and why.

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

## Applied `riskTiers`

Only `patterns` changed. `mergePolicy` and `evidenceRequirements` stay exactly as they
were — the thresholds were right, they were just pointed at the wrong files.

`detection.primaryLanguage` also becomes `TypeScript`, with a note recording that the
decision was taken against the recommendation still standing in `01-tech-stack.md`.
`framework` and `packageManager` stay `null`: those are settled by the walking skeleton,
and writing a guess into the harness config would make it look decided.

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

## `commands` — deliberately not changed yet

`build` and `typeCheck` are still `null`, so those required checks still silently pass.
That is wrong the moment application code lands, and it is correct until then.

The target is:

```json
"commands": {
  "lint": "bash scripts/check-conventions.sh && npm run lint",
  "test": "bash scripts/structural-tests.sh && npm run test",
  "build": "npm run build",
  "typeCheck": "npm run typecheck"
}
```

It was not applied with the tier patterns because there is no `package.json` yet. Pointing
a live pipeline at `npm run lint` in a repository with no npm project does not make the
gate stricter, it makes every stage fail for a reason that has nothing to do with the
change under review — and a gate that always fails gets ignored, which is how gates die.

This flips with the walking skeleton. The two shell gates stay in front of the npm scripts
when it does: they check things no TypeScript toolchain knows about — personal data, AI
attribution, confidence marking, spec reachability — and must not be displaced by the
language toolchain arriving.

## Applied alongside

**`.harnext/contract.json`** gains `contracts/**` in its `high` list. It carries a parallel
`riskTierRules` map with only `high` and `low`, and the oracle needs protecting in both
places or the stricter one is decorative.

## Still needs a human

**`docs/specs/01-tech-stack.md`** still recommends keeping Laravel and Filament as the
cheapest path. That recommendation has been overridden. The document should say so — the
fingerprint section stays as Observed fact about the predecessor, and the consequences
section becomes a record of a decision taken against its advice, and why.

Leaving it as-is is the more dangerous option: it is the first document anyone reads about
the stack, and it currently argues for the opposite of what is being built.
