---
name: grain-review
description: >
  Review a diff or PR for structural consistency — does this match how the repo
  already does it? The counterpart to ponytail-review: where ponytail-review
  hunts excess ("what can we cut"), grain-review hunts divergence ("does this go
  with the grain"). Finds a fact filed in the wrong doc, a claim missing its
  Observed/Inferred marking, vocabulary that ignores CONTEXT.md, a table shaped
  unlike its siblings, and later, code that reinvents an existing helper or
  ignores the established layering. Use when the user says "does this fit",
  "structural review", "grain review", "is this consistent", or invokes
  /grain-review.
license: MIT
---

Review for fit, not for size. The question is never "is this good code/prose" — it
is **"does this look like the rest of this repo, and is it filed where it belongs?"**

Divergence is only a finding when a sibling exists. If the thing is genuinely the
first of its kind, there is no grain to go against — say so and move on.

## Method

1. **Find the siblings.** Before judging anything, locate the two or three closest
   existing examples. A new spec section → the other sections in that document. A
   new spec document → the other numbered documents. A new domain term → the
   surrounding entries in `CONTEXT.md`. A new check → the existing checks in
   `scripts/check-conventions.sh`. Later, a new model/service/resource → its peers.
   **Do not review a diff you have not compared to its siblings.** That comparison
   is the whole skill.
2. **Name the divergence** — what the siblings do, what this does instead.
3. **Say which should win.** Usually the siblings. Occasionally the new thing is
   better and the siblings should follow it — say that explicitly rather than
   silently tolerating two patterns.

## Format

`<file>:L<line>: <tag> <what diverges>. <siblings do X>.`

Tags:

- `misfiled:` correct fact, wrong document. Name the doc that owns the topic.
- `unmarked:` a claim about the predecessor with no Observed / Inferred marking,
  or an inferred claim silently promoted to fact.
- `vocab:` a term that is not the `CONTEXT.md` word for the concept, or a new
  concept used twice without being added to `CONTEXT.md`.
- `shape:` structure unlike its siblings — a table with different columns, a
  section ordered differently, headings at the wrong level.
- `reinvent:` a helper, check, or section that duplicates one that already exists.
- `layer:` (code) crosses an established boundary — a route holding business
  logic, a view querying directly, tenant scoping bypassed.
- `orphan:` added without its counterpart — a spec doc absent from `00-index.md`
  and `README.md`, a domain term absent from `CONTEXT.md`, a rule with no check.

## Examples

✅ `docs/specs/07-flight-ingestion.md:L44: misfiled: defines the Flight schema. 03-data-model.md owns every entity table; link to it.`

✅ `docs/specs/09-roles-permissions.md:L31: unmarked: "Admin is scoped to its own organisation" reads as fact. Every other role line in this file carries (Inferred).`

✅ `docs/specs/05-organization-workspace.md:L88: vocab: "drone register". CONTEXT.md says UAS / aircraft register; 04 and 06 both use it.`

✅ `docs/specs/11-notifications.md:L1: orphan: new spec doc, not listed in 00-index.md or the README table. Every other numbered doc is in both.`

✅ `docs/specs/04-admin-resources.md:L210: shape: resource documented as prose. The other twelve use the Columns / Filters / Actions / Form-table layout.`

## Reconciliation with ponytail-review

They will disagree, by design. The rule: **consistency beats cuts.** If
ponytail-review wants to delete something grain-review says matches its siblings,
keep it and note `keep: matches <N> siblings`. Minimalism wins only where the
content is genuinely novel with no sibling to be consistent with.

## Boundaries

Scope: structural fit and filing only. Factual correctness about the predecessor,
and excess, are out of scope — those are a normal review pass and
`ponytail-review` respectively.

**Not findings:**

- A first-of-its-kind section with no sibling to diverge from.
- A deliberate, documented departure — if the diff says why it differs, that is a
  decision, not drift. Disagree with the reasoning if you like, but do not report
  it as inconsistency.
- Prose voice. This is about structure and vocabulary, not style.

Does not apply the fixes, only lists them.
