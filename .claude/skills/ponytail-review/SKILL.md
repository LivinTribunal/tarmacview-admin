---
name: ponytail-review
description: >
  Review focused exclusively on excess. Finds what to delete: duplicated facts,
  speculative structure, sections that restate their neighbours, hand-rolled
  versions of something the repo already has. One line per finding: location,
  what to cut, what replaces it. Default scope is a diff; pass "repo-wide" /
  "audit" to scan the whole tree, ranked biggest-cut-first. Use when the user
  says "review for over-engineering", "what can we cut", "is this bloated",
  "simplify review", "audit the repo", "find bloat", or invokes
  /ponytail-review. Complements correctness review — this one only hunts excess.
license: MIT
---

Review diffs for unnecessary bulk. One line per finding: location, what to cut,
what replaces it. The diff's best outcome is getting shorter.

This repo is documentation today and application code later. The lens is the same
either way — the tags below name both.

## Format

`L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` for
multi-file diffs.

Tags:

- `dupe:` a fact stated somewhere it already lives. The spec rule is
  cross-reference, never duplicate. Name the file that owns it.
- `delete:` dead section, speculative structure, a heading with nothing under it.
  Replacement: nothing.
- `yagni:` structure with one member — a table with one row, a category with one
  entry, an abstraction with one implementation, config nobody sets.
- `shrink:` same content, fewer lines. Show the shorter form.
- `stdlib:` (code) hand-rolled thing the language or framework ships. Name it.
- `native:` (code) a dependency doing what the platform already does. Name the feature.

## Examples

❌ "This section on service intervals might be more detailed than necessary, have
you considered whether all of this belongs here?"

✅ `04-admin-resources.md:L120: dupe: restates the dual service-interval rule. 03-data-model.md owns it; link instead.`

✅ `L52-68: delete: "Future considerations" section, no decision in it. Nothing replaces it.`

✅ `L31: yagni: risk tier with one pattern and no checks. Fold into T2 until a second case exists.`

✅ `L88-104: shrink: three paragraphs restating the table above them. Cut to the table.`

✅ `app/Support/Str.php:L12: stdlib: hand-rolled slugify. Str::slug(), ships with the framework.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Repo-wide (audit) mode

Same tags, same one-line format, pointed at the whole tree — for "audit the repo"
/ "what can I delete" / `/ponytail-review repo-wide`. Rank biggest-cut-first and
append deps to the score once there is code: `net: -<N> lines, -<M> deps
possible.` Hunt list: the same fact in two spec files, sections that only
introduce the next section, single-member structures, wrappers that only
delegate, dead config. One-shot report — lists findings, applies nothing.

## Boundaries

Scope: excess only. Factual errors, wrong claims about the predecessor system,
Observed/Inferred misclassification, and clean-room violations are explicitly out
of scope — route those to a normal review pass, not this one.

**Never flag for deletion:**

- The Observed / Inferred marking on a spec claim. It is load-bearing, not padding.
- The "why this matters" line under a domain rule. The rules in `CLAUDE.md` each
  cost a real defect to learn; the reasoning is the point.
- An open question or a named gap. A documented unknown is worth more than a
  confident guess.
- A single smoke test or assert-based self-check, once there is code.

Pairs with `grain-review` (structural fit). When a cut proposed here would break
an established convention — a spec section that matches its sibling sections, a
table shaped like every other table — `grain-review` overrules it: **consistency
beats brevity** for anything shared and convention-bearing. Minimalism wins only
for genuinely novel one-off content with no sibling.

Does not apply the fixes, only lists them.

"stop ponytail-review" or "normal mode": revert to verbose review style.
