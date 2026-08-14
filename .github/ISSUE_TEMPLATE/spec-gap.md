---
name: Spec gap
about: Something the rebuild specification cannot answer, or answers only by inference
title: ''
labels: 'spec-gap'
assignees: ''
---

## What the spec says now
<!-- Quote the claim and where it lives, e.g.
     docs/specs/09-roles-permissions.md — "Admin: administrative access, most likely
     scoped to own organisation" (Inferred) -->

## Why it is not good enough
<!-- What decision is blocked, or what would break if the inference is wrong? -->

## How to settle it
<!-- Pick the cheapest route that actually produces evidence. -->

- [ ] Read the predecessor's database directly
- [ ] Test on a **non-production** copy with a real account of the relevant role
- [ ] Recover from the mobile app build or server route listing
- [ ] Obtain sample files (flight logs, agricultural exports)
- [ ] Ask whoever operated the predecessor

## Definition of done

- [ ] Evidence obtained and recorded in the issue
- [ ] The affected `docs/specs/` file updated, and the claim re-marked Observed
- [ ] `CONTEXT.md` updated if a new domain concept appeared
- [ ] If it changes an implementation rule, `CLAUDE.md` updated too
