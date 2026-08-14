# CLAUDE.md

## Project Overview

TarmacView Admin — CAMO and fleet-log administration for UAS operators. Multi-tenant.

**The application does not exist yet.** This repo currently holds the rebuild
specification in `docs/specs/`, reconstructed by black-box inspection of a predecessor
system whose source repository was lost. The stack is not yet chosen — see
`docs/specs/01-tech-stack.md` for the fingerprint of the predecessor and the trade-off.

Until application code lands, this is a documentation repo and every change is Tier 1.

## Clean-room constraint — READ THIS FIRST

The predecessor is a real running system. This rebuild is **clean-room**: it reimplements
observed behaviour, it does not port code.

- **Never** copy source, templates, compiled bundles, CSS, or design assets from the
  predecessor into this repo.
- The specification in `docs/specs/` describes *behaviour and structure*. That is the
  permitted input.
- Branding and visual design are ours and are defined separately. Do not reproduce the
  predecessor's look.
- If you find yourself wanting to transcribe something you fetched from the live system
  rather than describe it, stop — that is the line.

## Personal data constraint

The predecessor holds real pilots' names, e-mail addresses, licence numbers and
certificate expiry dates, across several unrelated operator organisations.

- **Never** commit personal data, tenant names, device serial numbers, licence numbers or
  organisation access tokens — not in docs, not in fixtures, not in test data.
- Sample values are placeholders. Keep them placeholders.
- If you generate fixtures for the flight-log parsers, scrub them first.

## Specification Documents — READ BEFORE IMPLEMENTING

Before implementing anything, read the relevant spec:

- `docs/specs/00-index.md` — **ALWAYS READ THIS FIRST.** Scope, method, how confidence is
  marked, and which gaps are deliberately still open.
- `docs/specs/03-data-model.md` — entities, fields, types, relationships, ERD.
- `docs/specs/04-admin-resources.md` / `05-organization-workspace.md` — the admin surface.
- `docs/specs/06-org-report.md` — the operator report and its endpoint contract.
- `docs/specs/07-flight-ingestion.md` — the import paths.
- `CONTEXT.md` — the domain vocabulary. Use these terms, not synonyms.

**Findings in the spec are marked Observed or Inferred.** Never silently promote an
inferred claim to a settled one. If you resolve one — by reading the predecessor's
database, testing on a non-production copy, or a decision from the user — update the doc
and say what changed it.

## Open questions that block implementation

Three things are unresolved and expensive to guess wrong. Do not design around an
assumption here; ask, or go and find out:

1. **The permission model.** Only a superadmin session was ever observed. Role boundaries
   in `09-roles-permissions.md` are inferred. Build deny-by-default until the real matrix
   is recovered.
2. **The flight-log parsers.** The DJI `.txt` format and the agricultural XLSX layout were
   not observable. They need sample files.
3. **User ↔ Organisation.** A user carries an organisation id *and* attaches through a
   pivot. Which scopes data access is undecided, and it propagates everywhere.

## Domain rules that are easy to get wrong

Each of these is in the spec and each is a defect waiting to happen:

- **`User.email` is nullable and load-bearing.** A pilot can exist with no e-mail and no
  password. Making e-mail required or unconditionally unique breaks the pilot register.
- **A flight may have no pilot and no aircraft.** Assignment is a later step. Do not make
  it a creation-time requirement, and do not hide unassigned flights.
- **A failed parse is still a record.** Retain the flight with its parsing status and
  error. Dropping it loses evidence that a flight happened.
- **Duplicate sync uploads are expected.** Controllers re-upload; there is a dedicated
  state for it. Do not treat it as an error path.
- **Service intervals are dual.** Cycles *and* calendar months; whichever is reached first
  fires. One cycle = one recorded flight.
- **Maintenance readings are stated, not computed.** The technician's figures are the
  record. Never recompute them at read time.
- **An airframe with no device type has no VLOS limit and no service interval**, so it can
  never register a violation or a service warning. Surface that gap; never let it read as
  a pass.
- **Detach is not delete.** Removing a user from an organisation must not delete the user.
- **Tenant scoping is a security property, not a feature.** Every organisation-owned
  entity must be scoped by default, enforced globally rather than per-controller.

## Code Style Rules

Stack-specific conventions land here once the stack is chosen. Until then:

- **Comments**: sparse, lowercase, casual. Never comment what the code obviously does. Use
  short section labels above logical groups. Dashes (`-`), not em-dashes. Blank line
  before a section comment, none between the comment and its code.
- **Naming**: use `CONTEXT.md` vocabulary. The domain terms are Slovak in origin and were
  translated once, deliberately — do not reintroduce synonyms (`drone` for UAS,
  `accident` for occurrence, `licence` and `certificate` interchangeably).
- **User-facing strings**: the predecessor is Slovak-only with no i18n layer. Plan for
  translation from the first line of UI code — retrofitting it is far more expensive.
  Never hardcode user-visible text.
- **Locale**: decimal comma (`1,5`) and `DD.MM.YYYY` dates are real inputs. Parse both
  decimal separators; pick one date format and hold it.
- **Never silence a gate.** Suppression comments, lowered thresholds and CI-config edits
  to make something pass are forbidden. Fix the underlying code.

## Markdown conventions

Documentation is the product right now, so it carries the same bar as code:

- Every claim about the predecessor is marked Observed or Inferred.
- Cross-reference rather than duplicate. A fact lives in one file.
- Update `CONTEXT.md` when a new domain concept appears in two or more places.
- Keep the spec free of personal data, on every edit.

## Security Constraints

- Never commit secrets, API keys, `.env` files, or organisation access tokens
- Never commit credentials for the predecessor system
- Validate all external input at system boundaries
- Parameterised queries only, never string-built SQL
- Follow least privilege in all configurations

## Risk Tiers

Defined in `harness.config.json`:

| Tier | Patterns | Checks |
|------|----------|--------|
| T1 (low) | `docs/**`, `*.md` | lint |
| T2 (medium) | application source and tests, config | lint, type-check, test, build |
| T3 (high) | auth/permissions, tenant scoping, flight-log parsers, DB migrations | all T2 + manual approval |

T3 is drawn where getting it wrong is either a data-isolation breach or a corruption of the
airworthiness record. Changes there need extra test coverage and human review, not just an
agent review.

## Protected Files

Agents must never modify:

- `.github/workflows/**` — pipeline definitions
- `harness.config.json` — risk tier configuration
- `LICENSE`, `NOTICE`

## PR Conventions

- **Branch naming**: `<type>/<short-description>` (e.g. `feat/pilot-roster`, `docs/spec-gaps`)
- **Commit messages**: start with a verb, lowercase, casual, no conventional-commit
  prefixes. PR titles may use prefixes.
- **No AI attribution** in commits, PRs, or code comments.
- **Git identity**: commits must use `Štefan Moravík <stevko.moravik@gmail.com>`
- One issue per branch. Squash merge into `main`.
- **Keep the PR body in sync with the code.** If a change diverges from the open PR's
  description — added correctness fix, expanded scope, behaviour change, or a fix folded in
  from another issue — update the PR body via `gh pr edit <num> --body-file ...` without
  waiting to be asked. Either extend the in-scope section, or add an explicit "Folded-in
  fixes" section naming each unrelated fix, its root cause, and why it rode along.

## Issue tracker

Issues live in GitHub Issues for `LivinTribunal/tarmacview-admin`. Use the `gh` CLI.

## Harnext Automation

Not yet configured for this repo. The sibling `tarmacview` repo uses
[harnext](https://www.harnext.dev) for automated issue lifecycle; its workflows are bound
to that repo's self-hosted runner labels and its Python/TypeScript check set, so they are
deliberately **not** copied here. Run `harnext setup` in this repo to generate the
pipeline against this repo's own stack once one exists.
