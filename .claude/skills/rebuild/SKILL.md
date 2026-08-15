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

## The loop's own context is the scarce resource

This loop is meant to run for weeks. A tick that reads half the repository to change one
file has spent the budget the next twenty ticks needed. The orchestrator's context buys
judgement — which issue, what decision, is the returned work actually right. It does not
buy typing.

So the tick's default is to **delegate the doing and keep the deciding**.

**In the main loop, the orchestrator:**

- Recovers, reconciles, re-anchors
- Reads only enough to decide *one* action — targeted `Read`/`Grep`, or an `Explore` agent
  for anything that means sweeping many files
- Writes the brief, which carries decisions rather than options
- Reviews what comes back: the report **and** the diff, never the report alone
- Writes the prose that lands in the ledger — issue comments, PR bodies, commit messages,
  and the spec text itself

**It delegates:** writing and editing files, and any search wide enough that the file dumps
would cost more than the answer.

**Exception — do it yourself when delegating costs more.** Writing the brief, starting the
agent, reading its report and reviewing its diff has a fixed price. A one-line correction,
a label edit, a `STATE.md` rewrite is cheaper done directly. That is a cost comparison, not
a line count. The moment the change needs real judgement, spans several files, or touches a
T3 path, brief it out.

Running commands — gates, `gh`, git, builds — is not writing. Do that freely.

### Two dispatch paths, and which to reach for

The harnext pipeline in `.github/workflows/` is configured and working on this repo. Prefer
it, because it costs the loop nothing: the whole plan → implement → review → verify chain
runs on a runner, in its own context, and comes back as a PR with an audit trail.

```bash
gh workflow run harnext-plan.yml -f issue_number=<n>
```

Use it for anything **issue-shaped** — a slice with acceptance criteria that should become
one PR. Note the chain is self-advancing: on success a stage transitions the label and
triggers the next one, so only label an issue in when it is genuinely unblocked.

Use an **in-session subagent** for what the pipeline cannot take: exploration, a fix to a
red PR, a targeted edit that is not its own issue, or work you need to see the result of
before this tick can decide anything else.

### Picking the agent

| Agent | For |
|---|---|
| `Explore` | Read-only sweeps. Returns the conclusion, not the file dumps |
| `sonnet-implementer` | Mechanical and already fully decided: bulk renames, rote find/replace, boilerplate |
| `opus-implementer` | The default for a real slice |
| `opus-implementer-xhigh` | Hard code — tenant isolation, authorisation, flight-log parsing, migrations. That is this repo's T3 set, and it is T3 precisely because it is hard to get right |

One slice, one agent. Do not spawn a fleet for work a single agent can hold. Run agents in
parallel only when their files are disjoint, and only when each brief says which files it
owns.

### The brief

A vague brief is a documented failure mode, not a matter of style. Anthropic's own
multi-agent write-up traced subagents duplicating each other's work and misreading their
task directly to briefs like *"research the semiconductor shortage"*. The agent starts with
an empty context window, so **anything not in the brief it must rediscover or guess.**

The template and the full implementer contract live in `delegation.md`, next to this file.
Read it when you dispatch — not before.

### What comes back

Read the diff, not just the report. A report is a claim; the diff is the evidence.

Then run both lenses on the returned diff, every time:

- `ponytail-review` — excess. What can be deleted.
- `grain-review` — fit. Does this match how the repo already does it.

Where they disagree, **consistency beats cuts.** Every brief tells the implementer to run
`pr-ready` — which runs both — before it returns, so this is a second pass rather than the
first. With nobody reading these diffs before they land, a second pass is the point.

Found a problem? `SendMessage` the correction to the **same** agent. It still holds its
context and picks up where it stopped. Do not fix it by hand, and do not respawn a fresh
agent that has to rediscover everything.

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
