---
name: pr-ready
description: >
  Pre-push self-review: bring a diff to the state the review stage would have
  demanded, before the PR is opened or the fix is pushed. Runs the gate set, then
  the two quality lenses (ponytail-review for excess, grain-review for structural
  fit) against your own diff, applies what they find, and drafts or syncs the PR
  body. Owns the new-content ladder. Use when the user says "pr ready", "prepare
  the PR", "ready to push", "self-review this", or invokes /pr-ready.
license: MIT
---

The pass you run on your own diff before anyone else sees it. Everything the
review stage would send back, caught here instead.

## The ladder

Applies to new content of any kind — a new spec section, a new check, a new
helper, later a new class or method. Walk it in order and stop at the first rung
that holds:

1. **Does it need to exist at all?** The predecessor had a feature is not a reason;
   the spec records what was, not what must be.
2. **Does something already do it?** Grep first. A fact usually already lives in a
   spec doc; a check usually already lives in `check-conventions.sh`.
3. **Can an existing thing be extended?** A new column on an existing table, a new
   case in an existing check, a parameter on an existing function.
4. **Can it be one line at the call site?**
5. **Only then, write the new thing.**

**Adding a new function — or a new spec document — is the last resort.**

## Sequence

**1. Gates.** Run what CI runs, scoped to what you touched:

```bash
bash scripts/check-conventions.sh      # diff-scoped
bash scripts/structural-tests.sh       # spec/structure invariants
```

Both must be green. Never silence a gate to get there — suppression comments,
lowered thresholds, and edits to CI config are forbidden, and the conventions
check fails on newly added ones. Fix the underlying content.

**2. Excess.** Invoke `ponytail-review` on your own diff. Apply every finding you
agree with; for each one you reject, be able to say why in a sentence.

**3. Fit.** Invoke `grain-review` on the same diff. Same rule.

**4. Reconcile.** Where they disagree, **consistency beats cuts** — if
ponytail-review wants to delete something grain-review says matches its siblings,
keep it.

**5. Re-run the gates** after applying anything.

**6. PR body.** Draft it, or sync it if the PR is open. The body must describe the
diff as it now stands:

- Summary, and `Closes #N`.
- Risk tier — T1 docs, T2 application source, T3 tenant isolation / authorisation
  / flight-log parsing / migrations.
- **Spec impact** — if the change alters what `docs/specs/` claims about the
  predecessor, or resolves one of the open questions, name the file and what is now
  different. If it settles an `Inferred` claim, say what evidence settled it.
- Clean-room and data-hygiene checkboxes, honestly ticked.

If the change moved scope, update the body rather than leaving it stale
(`gh pr edit <num> --body-file ...`). Either extend the in-scope section, or add a
**Folded-in fixes** section naming each unrelated fix, its root cause, and why it
rode along. A body that no longer describes the diff is a defect.

## Repo-specific traps

Check these explicitly — each is a rule in `CLAUDE.md` that a diff can quietly break:

- A claim about the predecessor that lost its **Observed / Inferred** marking, or an
  inference promoted to fact without evidence.
- **Personal data** — names, e-mail addresses, licence numbers, tenant names,
  organisation access tokens. Never, in any file, including fixtures.
- **Clean-room** — nothing copied from the predecessor: no source, templates,
  bundles, CSS, or design assets.
- A new spec document not listed in `00-index.md` **and** the README table.
- A new domain concept used twice without an entry in `CONTEXT.md`.
- **AI attribution** anywhere — commits, code, PR body.
- Commit message style: verb-first, lowercase, no conventional-commit prefix.

## Boundaries

Prepares the diff; does not open the PR unless asked. Does not merge. Where it
finds something needing a decision rather than a fix — a genuine open question, a
spec gap that needs evidence from the predecessor's database — it says so and
leaves it, rather than guessing to make the diff look finished.
