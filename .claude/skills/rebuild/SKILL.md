---
name: rebuild
description: Boot the CAMO rebuild loop - recover state, reconcile it against reality, report where the rebuild actually is, then run an orchestrator tick. The single entry point for driving the rebuild; run it cold in a fresh session with no context and it will work out where things stand. Use when the user says "/rebuild", "start the rebuild", "resume the rebuild", "where are we", or wraps it in /loop.
---

# rebuild

The entry point. Run this cold, in a session that knows nothing, and it recovers the whole
picture before doing anything.

Three phases every time: **recover → reconcile → tick**. Never skip reconcile.

## Phase 1 — recover

Read `.rebuild/STATE.md`. It is gitignored working memory: what the last tick believed, so
a fresh session starts warm instead of re-deriving everything.

If it is missing or unreadable, that is fine and not an error. Skip to reconcile and
rebuild it from scratch — everything in it is derivable from the repository and the issue
tracker. That is the point: **losing the state file must never lose work.**

## Phase 2 — reconcile

`STATE.md` is a cache. It is not the ledger and it is not evidence. It is a plain file an
agent wrote, which means it can be wrong, stale, or quietly self-serving about what got
done. GitHub Issues, the PR list and git history are authoritative.

So check it against reality before trusting a word of it:

```bash
gh issue list --state open --json number,title,labels --limit 100
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision
git log --oneline -10 && git status --short
bash scripts/check-conventions.sh && bash scripts/structural-tests.sh
```

**Where the file and reality disagree, reality wins, always.** Correct the file, and say in
your report that it was wrong — a state file that drifts silently is worse than none,
because it looks like knowledge.

Then re-anchor out loud, in two sentences: the objective, and where we actually are. If
those two sentences do not match what you were about to do, do the other thing.

## Phase 3 — tick

Run one orchestrator tick — the decision rules live in
`.claude/skills/orchestrator/SKILL.md`, and the operating model behind them in
`docs/rebuild/00-operating-model.md`. Read those rather than improvising; this skill is the
launcher, that one is the judgement.

One tick. Assess, decide one action, act, record. Then update `STATE.md` and stop.

## Running it on a loop

`/rebuild` alone does a single tick. To make it continuous:

```
/loop /rebuild
```

Self-paced, so it decides its own cadence. It reads the ledger each time, so a tick that
finds nothing to do is a valid tick — say so and end it rather than inventing work.

## Updating STATE.md

Rewrite it at the end of every tick. Keep it short — it is a handover note, not a journal.
The sections in the template are the whole file; if it is growing past roughly a page, the
detail belongs in an issue comment instead, where it is durable and reviewable.

Never put in it: personal data, organisation tokens, or anything from the mirror. It is
gitignored, not secure.

## Reporting

Three lines to the user, every time: where the rebuild is, what this tick did, what is
next. If the tick escalated something, lead with that.
