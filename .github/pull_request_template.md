## Summary
<!-- 1-2 sentences. Link the issue: Closes #N -->

## Risk Tier
<!-- Classify for reviewer context. See harness.config.json. -->
- [ ] **Tier 1 (Low)**: Docs, `*.md`, `.gitignore`
- [ ] **Tier 2 (Medium)**: Application source, tests, build config
- [ ] **Tier 3 (High)**: Tenant isolation, authorisation, flight-log parsing, schema migrations

## Changes

### Added
-

### Changed
-

### Removed
-

## Spec impact
<!--
Does this change what docs/specs/ says about the predecessor, or resolve one of its
open questions? Name the file and what is now different:
    docs/specs/09-roles-permissions.md — Pilot scope confirmed against the DB, no longer inferred

If it resolves an Inferred claim, say what evidence settled it.
-->

## Testing
- [ ] `bash scripts/check-conventions.sh` passes
- [ ] Manual verification completed
<!-- Once application code exists: -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated

## Clean-room compliance
<!-- This rebuild reimplements observed behaviour; it does not port code. -->
- [ ] No source, templates, bundles, CSS or design assets copied from the predecessor
- [ ] Any new claim about the predecessor is marked Observed or Inferred
- [ ] No inferred claim silently promoted to fact

## Data hygiene
- [ ] No personal data (names, e-mails, licence numbers) committed
- [ ] No tenant names or organisation access tokens committed
- [ ] Any flight-log fixtures were scrubbed before committing
- [ ] No secrets, API keys, `.env` files, or predecessor credentials

## Review Checklist
- [ ] Follows `CLAUDE.md` and uses `CONTEXT.md` vocabulary
- [ ] Domain rules in `CLAUDE.md` respected (nullable pilot e-mail, unassigned flights, dual service intervals, detach ≠ delete)
- [ ] Tenant scoping enforced by default on any organisation-owned entity
- [ ] No AI attribution in commits, code or this PR
- [ ] Risk tier accurately reflects scope of changes
