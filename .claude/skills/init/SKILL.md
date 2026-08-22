---
name: init
description: Repository tour and startup runbook for tarmacview-administration - use when opening the repo, orienting to what's here, or asked how to build/run/test it.
---

# init

## Overview

`tarmacview-administration` is a **documentation-only repository**. There is
no application code yet, no runnable app, no server to start, no test suite,
no build step. What lives here is the clean-room rebuild specification for
TarmacView Admin (a CAMO / fleet-log tool for UAS operators), reconstructed
by black-box inspection of a predecessor system whose source was lost. The
stack has not been chosen — see `docs/specs/01-tech-stack.md` for the
predecessor fingerprint and the rebuild trade-off.

Because there is nothing to boot, the "runbook" for this repo is: read the
right spec, run the conventions gate, open a PR. Everything below is
grounded in what actually exists on disk right now.

## Repository layout

```
README.md                    project overview, status, roadmap of the specs
CLAUDE.md                    conventions agents/contributors must follow
CONTEXT.md                   domain glossary (canonical vocabulary)
harness.config.json          risk-tier + protected-file config (protected)
docs/specs/                  the rebuild specification (11 files, 00..10)
scripts/check-conventions.sh the lint gate
.github/workflows/ci.yml     GitHub Actions: runs the lint gate (protected)
.github/pull_request_template.md
.github/ISSUE_TEMPLATE/{feature,spec-gap}.md
.gitignore
```

Nothing else exists at the repo root. There is no `package.json`,
`pyproject.toml`, `composer.json`, `go.mod`, `Cargo.toml`, `Gemfile`,
`Makefile`, `Dockerfile`, `docker-compose.yml`, `.tool-versions` or
`.nvmrc`. Confirmed by directory listing at the root.

## Runnable apps

**None.** There is no backend, no frontend, no CLI, no worker, no
docker-compose service. Do not fabricate ports, endpoints, or start
commands — they do not exist yet. When application code lands, this
skill needs to be regenerated (the CI comment in `.github/workflows/ci.yml`
says "Stack-specific jobs (type-check, test, build) land here alongside
the application code, per harness.config.json").

The `harness.config.json` `commands` block is explicit about this state
(`harness.config.json:92-97`):

```
"commands": {
  "lint": "bash scripts/check-conventions.sh",
  "test": null,
  "build": null,
  "typeCheck": null
}
```

`test`, `build` and `typeCheck` are literally `null`. Do not invent them.

## Environment variables

None referenced anywhere in the repo. `.env.example` does not exist.
`.gitignore` reserves the usual `.env` / `.env.*` patterns for later, and
lists `HARNEXT_AGENT` semantics (see below), but that is not an app env
var — it is a switch consumed by the lint script.

## The only command you can run: the conventions gate

Source: `scripts/check-conventions.sh` (147 lines, bash). This is the
"mechanically-decidable half of review" and — while the repo is
documentation-only — is the **single required CI check**
(`harness.config.json` tier1 `requiredChecks: ["lint"]`).

### What it checks

The script is diff-scoped against the merge-base with `main` by default
(`scripts/check-conventions.sh:26-34`), so pre-existing violations never
block an unrelated PR. Sections in order:

1. **Personal data** (`:56-73`) — fails on real e-mails at
   `zephyruas.eu` / `vsdas.*` / `ithelps.*`, on strings that look like
   `SVK-RP-...` / `LUX-RP-...` pilot licence numbers, and on any bare
   32-hex string (organisation access tokens double as report URLs in
   the predecessor). This is why fixtures must be scrubbed.
2. **AI attribution** (`:78-87`) — fails on `Co-Authored-By: Claude`,
   `Generated with [Claude`, or `🤖 Generated` in any tracked file
   **or** in the HEAD commit message. Repo policy: no AI attribution in
   commits, PRs or code.
3. **Dead relative markdown links** (`:92-104`) — fails on `.md` files
   whose `](target)` links don't resolve on disk. Skips `http*`,
   `mailto:` and pure anchors.
4. **Protected files** (`:107-122`, diff-scoped only) — warns on humans
   editing `.github/workflows/**`, `harness.config.json`; **fails hard when `HARNEXT_AGENT=1`** (i.e. when the caller
   is an agent). Note: `CLAUDE.md` is listed as protected in
   `harness.config.json` but is not enforced by the script — treat it as
   protected anyway.
5. **Spec claims stay marked** (`:126-136`) — warns on any file under
   `docs/specs/**` (except `00-index.md` and `10-glossary-sk-en.md`)
   that has no `Observed` / `Inferred` / `Observable` / `Verified`
   marker. Prevents silently promoting an inference to fact.
6. **§ section references resolve** (`:190-329`) — the `§` half of item 3.
   Fails when a `§` reference (a quoted title, or a bare word) names no
   heading and no bold lead-in in the document it points at: the file
   named immediately before the `§`, or the host file if none is.
   Warns when it resolves to an Observed capture whose document also
   carries the decided `… in the rebuild` subsection. Numeric forms
   (`§5`, `§§5-7`) are skipped, as are fenced code blocks, a `§` written
   inside an inline code span, and unqualified references in
   non-markdown hosts.

Exit codes: `0` on clean or warnings only, `1` on any FAIL.

### How to run it

Diff vs merge-base with `main` (default — matches PR CI):

```
bash scripts/check-conventions.sh
```

Full-tree sweep (matches the `sweep` job that runs on push to `main`):

```
bash scripts/check-conventions.sh --all
```

Simulate the agent-mode enforcement (protected-file edits become hard
failures):

```
HARNEXT_AGENT=1 bash scripts/check-conventions.sh
```

There is no `--help`; the script has no other flags.

## CI

Single workflow: `.github/workflows/ci.yml`. Two jobs, both
`ubuntu-latest`, 10-minute timeout, actions/checkout@v5 with
`fetch-depth: 0` (required so the merge-base diff works).

- `lint` — runs on `pull_request` (`opened|synchronize|reopened`), `push`
  to `main`, and `workflow_dispatch`. Command: `bash scripts/check-conventions.sh`.
- `sweep` — full-tree sweep. Runs only on `push` to `main` and
  `workflow_dispatch`. Command: `bash scripts/check-conventions.sh --all`.

`concurrency.group` is keyed on PR number or ref with
`cancel-in-progress: true`, so pushing new commits supersedes in-flight
runs.

## Risk tiers

Defined in `harness.config.json:12-90`. Summary for orientation:

| Tier | Patterns | Required checks | Approvals |
|------|----------|-----------------|-----------|
| T1 low | `docs/**`, `**/*.md`, `**/*.txt`, `CHANGELOG*`, `.editorconfig`, `.gitignore` | `lint` | 0, self-merge |
| T2 medium | `app/**`, `src/**`, `tests/**`, `database/**`, `routes/**`, `resources/**`, `config/**`, `composer.json`, `package.json` | `lint`, `type-check`, `test`, `build` | 1, review agent |
| T3 high | `**/*polic*`, `**/*permission*`, `**/*authoriz*`, `**/*authoris*`, `**/*tenant*`, `**/*scope*`, `**/*parser*`, `**/*import*`, `**/migrations/**`, `database/migrations/**` | all T2 + manual-approval | 2, review agent |

Right now every change is T1 (nothing else exists to touch). The T2/T3
gate commands are still `null` until the stack lands.

## Protected files — do not edit as an agent

Per `harness.config.json:122-128`:

- `.github/workflows/**`
- `harness.config.json`
- `CLAUDE.md`

The lint script additionally hard-fails when `HARNEXT_AGENT=1` on
protected-file edits (excluding `CLAUDE.md`, which is enforced by
policy rather than by the script). If a change genuinely needs one of
these edited, escalate to the user rather than editing.

## Where to read what

Read `docs/specs/00-index.md` first — it explains the method,
confidence marking, and the three deliberate gaps that block
implementation. Then read the doc closest to your task:

| Doc | When you need it |
|-----|-------------------|
| `docs/specs/00-index.md` | Always first — method, confidence markers, gaps |
| `docs/specs/01-tech-stack.md` | Stack choice + rebuild trade-off (Filament vs. move off) |
| `docs/specs/02-sitemap-routes.md` | Every observed route, method, auth requirement |
| `docs/specs/03-data-model.md` | Entities, fields, types, relationships, ERD |
| `docs/specs/04-admin-resources.md` | Admin surface — tables, filters, actions, forms |
| `docs/specs/05-organization-workspace.md` | Organisation editor + 7 sub-registers |
| `docs/specs/06-org-report.md` | Operator report + JSON endpoint contract |
| `docs/specs/07-flight-ingestion.md` | The four flight-import paths |
| `docs/specs/08-maps.md` | Geozone maps + KML layers |
| `docs/specs/09-roles-permissions.md` | Role vocabulary — **inferred, not observed** |
| `docs/specs/10-glossary-sk-en.md` | Slovak → English domain terminology |
| `CONTEXT.md` | Canonical vocabulary. Use these terms, never synonyms. |
| `CLAUDE.md` | Full contributor conventions |

## Domain traps to internalise before touching a spec

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

Three open questions block implementation (`CLAUDE.md`, "Open questions"):
the permission model (only superadmin was observed), the flight-log
parsers (no sample DJI `.txt` or agricultural XLSX files yet), and the
`User ↔ Organisation` relationship (both a foreign key and a pivot
exist; which scopes data access is undecided).

## Branch + PR conventions

- Branch names: `<type>/<short-description>` (e.g. `docs/spec-gaps`,
  `feat/pilot-roster`).
- Commit messages: lowercase, verb-first, no conventional-commit
  prefixes. PR titles may use prefixes.
- Git identity for commits: `Štefan Moravík <stevko.moravik@gmail.com>`.
- One issue per branch; squash-merge into `main`.
- Never AI-attribute a commit, PR body or comment (the lint script will
  fail the commit).
- Keep the PR body in sync with the diff — add a "Folded-in fixes"
  section when scope grows.
- Issue templates: `.github/ISSUE_TEMPLATE/feature.md` (new work) and
  `.github/ISSUE_TEMPLATE/spec-gap.md` (found something the spec is
  wrong or silent on). Issue tracker: GitHub Issues on
  `LivinTribunal/tarmacview-admin` via `gh`.

## Harnext state

Not yet configured for this repo. `CLAUDE.md` calls this out explicitly:
run `harnext setup` here **only after** application code lands, so the
generated pipeline binds to the real stack instead of the empty one.
Until then, the CI in `.github/workflows/ci.yml` is the whole gate.

## Unknown — confirm with the team

- **How to run application tests / typecheck / build.** These have no
  command yet (`harness.config.json` `commands` sets them to `null`;
  no manifest at the root defines them). Do not invent them; when the
  stack is chosen these are wired in as part of the same PR.
- **Whether the rebuild will stay on Laravel + Filament** or move off.
  `docs/specs/01-tech-stack.md` sets out the trade-off but the choice
  is not recorded here.
