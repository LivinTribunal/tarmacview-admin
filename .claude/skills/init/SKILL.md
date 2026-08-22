---
name: init
description: Repository tour and startup runbook for tarmacview-administration - use when opening the repo, orienting to what's here, or asked how to build/run/test it.
---

# init

## Overview

`tarmacview-administration` holds two things: the clean-room rebuild specification for
TarmacView Admin (a CAMO / fleet-log tool for UAS operators), and the application being
built from it. Both are live. The specification was reconstructed by black-box inspection
of a predecessor system whose source was lost; the application is a **Next.js App Router**
project in TypeScript, with Postgres reached through Drizzle, tenant isolation carried by
Postgres row-level security, and Better Auth with admin-provisioned accounts.

The stack is decided. `harness.config.json` `detection` records what it is and why;
`docs/specs/01-tech-stack.md` holds the predecessor's fingerprint the decision was taken
*against*, not the decision itself.

What is built, each figure paired with the command that re-derives it — do not carry these
numbers forward without re-running them:

- **8 of the 13 admin resources** in `docs/specs/04-admin-resources.md` (`ls src/app/admin`)
  — `device-types`, `flights`, `general-documents`, `maps`, `organizations`,
  `training-types`, `trainings`, `users`.
- **The organisation workspace and all seven tabs** (`src/lib/organizations/workspace.ts`).
- **The organisation report** — page, print view, the `/data` endpoint and three download
  routes (`find src/app/organization-reports -type f`).
- **15 migrations**, `0000`–`0014`, including the row-level security policies
  (`ls drizzle/*.sql`).

## Repository layout

```
src/                         application source
  app/                       App Router: admin/, api/, organization-reports/, login/
  components/                shared index table, resource form, sign-out form
  lib/                       auth, db, tenant, report, table, form, i18n, per-resource modules
  middleware.ts              turns anonymous requests away (tier 3)
drizzle/                     schema migrations + meta/_journal.json
tests/                       contracts/, domain/, tenancy/, auth/, support/
contracts/                   route, form and report contracts - the test oracle (protected)
tools/extract-contracts.mjs  regenerates contracts/ from the observation mirror
docs/specs/                  the rebuild specification (11 files, 00..10)
docs/rebuild/                operating model, and the risk tiers for this stack
scripts/                     check-conventions.sh, structural-tests.sh, watchdogs
.harnext/                    contract.json + five stage scripts
.github/workflows/           ci.yml and eight harnext-*.yml (protected)
README.md CLAUDE.md CONTEXT.md harness.config.json
package.json tsconfig.json vitest.config.ts eslint.config.mjs drizzle.config.ts
.env.example
```

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app needs a Postgres reachable at `DATABASE_URL` under a role that is **neither
`SUPERUSER` nor `BYPASSRLS`** — either one skips every policy silently, and those policies
are the tenant boundary. `.env.example` explains this beside the variable; read it there
rather than restating it.

**Gap: there is no migration command for a local dev database.** `package.json` has no
`db:migrate` script. `tests/support/database.ts` applies the migrations itself, reading
`drizzle/meta/_journal.json` in index order, but that is the test harness and not a
developer path. Do not invent a command for it.

## Environment variables

`.env.example` carries four, all with placeholder values:

- `DATABASE_URL` — the application's own database role
- `BETTER_AUTH_SECRET` — signing secret, generated per deployment, never committed
- `BETTER_AUTH_URL` — public origin
- `FILE_STORAGE_ROOT` — upload root, outside anything the web server publishes

## Commands

The authoritative set is `harness.config.json` `commands`:

```
lint       bash scripts/check-conventions.sh && npm run lint
test       bash scripts/structural-tests.sh && npm run test
build      npm run build
typeCheck  npm run typecheck
```

The shell gates run first and stay first — they check things no TypeScript toolchain knows
about: personal data, AI attribution, confidence marking.

## Tests

`vitest.config.ts` declares two projects over four suites:

- **`unit`** — `tests/contracts/**` (route, form and report-shape parity against the
  oracle) and `tests/domain/**` (the domain rules below, one named suite each).
- **`database`** — `tests/tenancy/**` and `tests/auth/**`, which start `postgres:17-alpine`
  through Testcontainers.

`npm run test` runs both. The `database` project needs a container engine and **fails
rather than skips** without one, deliberately: a tenant-isolation test that quietly does
not run is a green build proving nothing. If you cannot run it, say so rather than
reporting the suite green.

The five verification layers these suites implement are set out in
`docs/rebuild/00-operating-model.md` §"5. The quality system".

## The conventions gate

Source: `scripts/check-conventions.sh` (347 lines, bash). Diff-scoped against the
merge-base with `main` by default (`:22-47`), so pre-existing violations never block an
unrelated PR. Sections in order:

1. **Personal data** (`:49-73`) — fails on real e-mails from the predecessor's domains, on
   strings shaped like pilot licence numbers, and on any bare 32-hex string (organisation
   access tokens double as report URLs in the predecessor). Deliberately **not**
   code-fence filtered: a real address leaks whether or not it sits in a code block. This
   is why fixtures must be scrubbed.
2. **AI attribution** (`:94-106`) — fails on an AI co-author trailer or a generated-with
   line in any tracked file **or** in the HEAD commit message.
3. **Dead relative markdown links** (`:108-123`) — fails on `](target)` links that do not
   resolve on disk. Skips `http*`, `mailto:` and pure anchors.
4. **Protected files** (`:125-163`, diff-scoped only) — warns on human edits, **fails hard
   when `HARNEXT_AGENT=1`**. The list is compiled out of `harness.config.json` rather than
   hardcoded, so every entry in it is enforced.
5. **Spec claims stay marked** (`:165-177`) — warns on any file under `docs/specs/**`
   (except `00-index.md` and `10-glossary-sk-en.md`) carrying no
   `Observed` / `Inferred` / `Observable` / `Verified` marker.
6. **§ section references resolve** (`:179-336`) — the `§` half of item 3. Fails when a `§`
   reference names no heading and no bold lead-in in the document it points at: the file
   named immediately before the `§`, or the host file if none is. Warns when it resolves to
   an Observed capture whose document also carries the decided `… in the rebuild`
   subsection. Numeric forms (`§5`, `§§5-7`) are skipped, as are fenced code blocks and a
   `§` written inside an inline code span.

Exit codes: `0` on clean or warnings only, `1` on any FAIL.

One trap worth the line: sections 3 and 6 both accept a path that resolves either from the
host file's own directory **or** from the repo root. A root-relative markdown link written
in this file therefore passes the gate while rendering dead from `.claude/skills/init/`.
Keep paths here in backticks, as this file does.

```bash
bash scripts/check-conventions.sh                    # diff vs merge-base (matches PR CI)
bash scripts/check-conventions.sh --all              # full-tree sweep (matches the sweep job)
HARNEXT_AGENT=1 bash scripts/check-conventions.sh    # agent mode: protected edits hard-fail
```

There is no `--help`; the script has no other flags.

## The structural gate

`scripts/structural-tests.sh` (130 lines) is whole-tree where the conventions gate is
diff-scoped: it asks whether the repo still hangs together. Six invariants — every numbered
spec doc named in both `docs/specs/00-index.md` and `README.md`, contiguous spec numbering,
confidence marking present, `harness.config.json` and `.harnext/contract.json` parseable,
every check script executable, and architectural boundaries (dormant, none declared yet).

The reachability check is why the `README.md` documentation table is load-bearing: dropping
a spec doc from it fails CI.

```bash
bash scripts/structural-tests.sh
```

## CI

`.github/workflows/ci.yml`, six jobs. Five run on `pull_request`, `push` to `main` and
`workflow_dispatch`; `sweep` runs only on push and dispatch.

| Job | Command |
|-----|---------|
| `lint` (Conventions) | `bash scripts/check-conventions.sh`, then `npm run lint` |
| `structural-tests` | `bash scripts/structural-tests.sh` |
| `type-check` | `npm run typecheck` |
| `test` | `npm run test` |
| `build` | `npm run build` |
| `sweep` | `bash scripts/check-conventions.sh --all` |

Job ids are spelled exactly as `harness.config.json` `requiredChecks` names them. The
conventions and sweep jobs check out with `fetch-depth: 0` so the merge-base diff works.
`concurrency.group` is keyed on PR number or ref with `cancel-in-progress: true`.

Tier 1 requires only `lint` and `structural-tests`, but `ci.yml` has no path filter — every
PR runs all six regardless of tier.

Eight `harnext-*.yml` workflows sit beside it, driving the issue lifecycle: triage, plan,
implement, review, review-fix, verify, doc-gardening, stage-watchdog.

## Risk tiers

Defined in `harness.config.json` `riskTiers`.

| Tier | Patterns | Required checks | Merge policy |
|------|----------|-----------------|--------------|
| T1 low | `docs/**`, `*.md`, `**/*.md`, `**/*.txt`, `CHANGELOG*`, `.editorconfig`, `.gitignore` | `lint`, `structural-tests` | 0 approvals, self-merge |
| T2 medium | `src/**`, `app/**`, `lib/**`, `components/**`, `server/**`, `tests/**`, `e2e/**`, `package.json`, `package-lock.json`, `tsconfig.json`, and the `next` / `vite` / `vitest` / `playwright` / `tailwind` configs | `lint`, `type-check`, `test`, `build` | 0 approvals, review agent |
| T3 high | `**/*polic*`, `**/*permission*`, `**/*authoriz*`, `**/*authoris*`, `**/auth/**`, `**/*tenant*`, `**/*scope*`, `**/*parser*`, `**/*import*`, `**/middleware.ts`, `**/migrations/**`, `drizzle/**`, `drizzle.config.*`, the `prisma` paths, `contracts/**` | `lint`, `type-check`, `test`, `build` | 0 approvals, review agent |

T3 no longer gates on human approval — the owner granted the agent loop merge authority, so
the review agent and the full check set are what stand there. `contracts/**` is the
exception and is also a protected file: it is the test oracle, and an agent that can weaken
an assertion can make every gate report green while the behaviour is wrong.
`docs/rebuild/01-harness-tiers-typescript.md` records how the tiers were derived for this
stack.

## Protected files — do not edit as an agent

From `harness.config.json` `protected_files`:

- `.github/workflows/**`
- `harness.config.json`
- `CLAUDE.md`
- `contracts/**`

All four are enforced by conventions-gate section 4, which reads the list from the config.
Under `HARNEXT_AGENT=1` an edit to any of them is a hard failure. If a change genuinely
needs one, escalate to the owner rather than editing.

## Where to read what

Read `docs/specs/00-index.md` first — method, confidence marking, and which gaps are
deliberately still open. Then the doc closest to your task:

| Doc | When you need it |
|-----|-------------------|
| `docs/specs/00-index.md` | Always first — method, confidence markers, gaps |
| `docs/specs/01-tech-stack.md` | Predecessor fingerprint the stack decision was taken against |
| `docs/specs/02-sitemap-routes.md` | Every observed route, method, auth requirement |
| `docs/specs/03-data-model.md` | Entities, fields, types, relationships, ERD |
| `docs/specs/04-admin-resources.md` | Admin surface — tables, filters, actions, forms |
| `docs/specs/05-organization-workspace.md` | Organisation workspace and its seven tabs |
| `docs/specs/06-org-report.md` | The organisation report and its endpoint contract |
| `docs/specs/07-flight-ingestion.md` | The four flight-import paths |
| `docs/specs/08-maps.md` | Geozone maps + KML layers |
| `docs/specs/09-roles-permissions.md` | Observed role vocabulary, and the decided matrix |
| `docs/specs/10-glossary-sk-en.md` | Slovak → English domain terminology |
| `docs/rebuild/00-operating-model.md` | Clean-room split, the two loops, the quality system |
| `docs/rebuild/01-harness-tiers-typescript.md` | How the risk tiers apply to this stack |
| `contracts/README.md` | The test oracle, and how it is regenerated |
| `CONTEXT.md` | Canonical vocabulary. Use these terms, never synonyms. |
| `CLAUDE.md` | Full contributor conventions |

## Domain traps to internalise before touching this repo

From `CLAUDE.md` — each of these is a defect waiting to happen:

- `User.email` is nullable and load-bearing (pilots may have no e-mail).
- A flight may have no pilot and no aircraft — assignment is a later step.
- A failed parse is still a record — do not drop it.
- Duplicate sync uploads are expected — dedicated state, not an error.
- Service intervals are dual: cycles **and** calendar months; whichever
  fires first wins. One cycle = one recorded flight.
- Maintenance readings are **stated, not computed** by the technician —
  never recompute at read time.
- An airframe with no device type has no VLOS limit and no service
  interval — surface the gap; never let it read as a pass.
- Detach is not delete — removing a user from an organisation must not
  delete the user.
- Tenant scoping is a security property enforced globally, not
  per-controller.

## What is decided, and what is still open

Two of the three questions that once blocked implementation are answered. **Read the
document rather than a summary of it** — copying a decision into a second place is how this
file went stale in the first place:

- **The permission model** — `docs/specs/09-roles-permissions.md` §"The rebuild's
  permission model".
- **User ↔ Organisation** — decided in favour of membership;
  `docs/specs/03-data-model.md` §"Membership in the rebuild".

Still open, and worth checking before designing around them:

- **The flight-log parsers** (#6) — the DJI `.txt` format and the agricultural XLSX layout
  were never observable and still need sample files. This blocks ingestion, and only
  ingestion.
- **Write authority over people and memberships** (#48) — the per-membership-role
  predicate. Two write actions on the organisation report wait on it.
- **`CLAUDE.md`'s own stale claims** (#88, item 2) — it still says the application does not
  exist and that harnext is not configured. It is protected, so only the owner can correct
  it. Trust this runbook and the tree over it.

## Branch + PR conventions

- Branch names: `<type>/<short-description>` (e.g. `docs/spec-gaps`,
  `feat/pilot-roster`).
- Commit messages: lowercase, verb-first, no conventional-commit
  prefixes. PR titles may use prefixes.
- Git identity for commits: `Štefan Moravík <stevko.moravik@gmail.com>`.
- One issue per branch; squash-merge into `main`.
- Never AI-attribute a commit, PR body or comment (the conventions gate will
  fail the commit).
- Keep the PR body in sync with the diff — add a "Folded-in fixes"
  section when scope grows.
- Issue templates: `.github/ISSUE_TEMPLATE/feature.md` (new work) and
  `.github/ISSUE_TEMPLATE/spec-gap.md` (found something the spec is
  wrong or silent on). Issue tracker: GitHub Issues on
  `LivinTribunal/tarmacview-admin` via `gh`.
