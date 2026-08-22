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

`patterns` changed to match the TypeScript tree. `mergePolicy` changed separately and for a
different reason — see "Merge authority" below.

`detection.primaryLanguage` also becomes `TypeScript`, with a note recording that the
decision was taken against the recommendation `docs/specs/01-tech-stack.md` used to carry.
`framework` and `packageManager` were left `null` here and filled in later — `Next.js` and
`npm` — once the stack decision was written up rather than guessed at.

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
  "package-lock.json",
  "tsconfig.json",
  "next.config.*",
  "vite.config.*",
  "vitest.config.*",
  "playwright.config.*",
  "tailwind.config.*"
]
```

The lockfile line was written `pnpm-lock.yaml` and corrected to `package-lock.json` by #25,
which settled the package manager as npm. Until then the tree's real lockfile matched no
tier at all — a dependency change could have landed as a catch-all edit.

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
  "drizzle.config.*",
  "prisma/migrations/**",
  "prisma/schema.prisma",
  "contracts/**"
]
```

Four of these are additions rather than translations, and each has a reason:

**`**/middleware.ts`** — in a Next.js-shaped app this is where request-time authentication
and tenant resolution actually run. A file that decides who you are and which organisation
you are in belongs in the same tier as the policies it feeds.

**`drizzle.config.*`** — added by #26, on the same logic. `drizzle/**` matches the
migration directory but not the file that tells drizzle-kit which schema to read and where
to write, and a change to that file redirects every migration after it. It belongs beside
the migrations it points at, not in the catch-all, which is where it sat until #26.

**`contracts/**`** — the extracted route, form and report contracts are the test oracle.
An agent that can edit the oracle can make any failing test pass by weakening what it
asserts, and every gate downstream would still report green. Changing the oracle is a
human decision. This is the single most important addition on the list.

**`**/*import*`** is kept deliberately broad. It catches the flight-log ingestion paths,
and it will also catch unrelated files with "import" in the name. Over-matching into tier 3
costs an approval; under-matching costs an airworthiness record.

## `commands` — applied with the shell

`build` and `typeCheck` were `null`, so those two required checks passed vacuously for every
tier 2 and tier 3 change. #25 flipped all four alongside the walking skeleton's shell:

```json
"commands": {
  "lint": "bash scripts/check-conventions.sh && npm run lint",
  "test": "bash scripts/structural-tests.sh && npm run test",
  "build": "npm run build",
  "typeCheck": "npm run typecheck"
}
```

It was not applied with the tier patterns because there was no `package.json` to point at.
Pointing a live pipeline at `npm run lint` in a repository with no npm project does not make
the gate stricter, it makes every stage fail for a reason that has nothing to do with the
change under review — and a gate that always fails gets ignored, which is how gates die.
That is why the flip waited for the shell rather than leading it, and why the two landed in
one PR: a shell merging first would be a tier 2 change whose own suites never ran.

The property this section asked for held. The two shell gates sit in front of the npm
scripts, not behind them — they check things no TypeScript toolchain knows about (personal
data, AI attribution, confidence marking, spec reachability) and were not displaced by the
language toolchain arriving. `.github/workflows/ci.yml` carries a job per required check,
spelled with the ids the tiers name — `lint`, `structural-tests`, `type-check`, `test`,
`build` — so all four gates now execute against real code.

## Merge authority

The owner granted the agent loop **full merge authority across all three tiers**. Applied:

- tier 2 and tier 3 `mergePolicy` → `minApprovals: 0`, `allowSelfMerge: true`
- tier 3 `requiredChecks` → `manual-approval` removed
- tier 3 `evidenceRequirements` → `manual-review` removed

The two removals are not a weakening on top of the grant, they are a consequence of it.
Leaving a required check named `manual-approval` in place when no human is going to supply
one produces a pipeline that blocks forever on a signal that will never arrive — and the
repair for that, under pressure, is someone disabling the check. Better that the config
says what is true.

`requireReviewAgent` stays `true` at both tiers. With nobody reading diffs before they
land, the review agent and the check set are the only control left, so removing it would
leave nothing.

**The carve-out:** `contracts/**` is added to `protected_files`. It is the test oracle. An
agent that can weaken an assertion can make every gate report green while the behaviour is
wrong, and that failure is invisible exactly because everything looks fine.

The consequence played out on issue #9, which needed the contracts regenerated: the loop had
to escalate rather than close it. The owner authorised that one change, and #9 closed in
#19 — after the returned diff was checked field by field against `main` to confirm it only
ever *added* fields and weakened no existing assertion.

That is the shape the carve-out is meant to force. Not "agents never touch the oracle", but
"a change to the oracle is a decision someone makes, and a diff someone reads."

### This protection is enforced

`check-conventions.sh` only makes a protected-file edit a hard failure when
`HARNEXT_AGENT=1`, and the owner has since set that variable in all seven harnext agent
stages. `protected_files` is now a gate that stops the loop rather than a convention it is
asked to honour, and the oracle lock reads as strongly as it is.

## Applied alongside

**`.harnext/contract.json`** gains `contracts/**` in its `high` list. It carries a parallel
`riskTierRules` map with only `high` and `low`, and the oracle needs protecting in both
places or the stricter one is decorative.

## Still needs a human

Three items stood here and two have closed. `docs/specs/01-tech-stack.md` was rewritten: the
fingerprint stays as Observed fact about the predecessor, and the section after it records
the decision taken against its advice. The `commands` flip landed with #25 — see
§"`commands` — applied with the shell".

One item is left, and it is still the owner's edit: **three root-level files match no tier
pattern at all**, so each falls through to the catch-all rather than to tier 2 —
`eslint.config.mjs` and `next-env.d.ts`, which arrived with the shell in #25, and
`.env.example`, which arrived with the tier-3 slice in #26. This list was four; the lockfile
entry closed with #25 and `drizzle.config.*` with #26, both above. Until the remaining edit
lands, an agent can change the lint configuration or the environment template at the lowest
bar in the file.
