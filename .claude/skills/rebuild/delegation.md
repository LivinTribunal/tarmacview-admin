# Delegation reference

Read this when a tick is about to dispatch an agent. The rule that sends you here is in
`SKILL.md`: the orchestrator decides, the agent writes.

## What the agent already has — do not restate it

A subagent starts with a fresh conversation but **not** a blank slate. It inherits
`CLAUDE.md` and the repo itself. So a brief that re-types the clean-room constraint, the
personal-data rule, the domain traps or the tier table is spending tokens on something the
agent can already read, and burying the part only you know underneath it.

Put in the brief what the agent **cannot** derive: what you decided, what you already
looked at, and where the edges are.

Point at rules, never copy them. `CLAUDE.md` for the constraints, `CONTEXT.md` for
vocabulary, the numbered spec docs for behaviour.

## The brief

```
## Brief: <slice>

Goal: <one sentence, an observable outcome — not "update the parser" but
  "a failed parse keeps the flight record with its status and error visible">

Context: <what your exploration already found. Relevant excerpts, the nearest existing
  pattern to mirror, file:line anchors, the gotcha you hit. This is the field that decides
  whether the agent succeeds — everything omitted here it must rediscover or guess>

Files: <paths to create or modify, with line anchors where you know them. When agents run
  in parallel this is the slice's exclusive ownership>

Design: <the decided approach. Names, signatures, field types, route paths, the edge cases
  and what happens at each. Concrete enough to transcribe rather than design>

Sequence: <the ordered steps, when order matters, so a lower-effort agent never has to
  infer it>

Out of scope: <what not to touch, including files another slice owns. This is what stops
  over-reach, and it is the field most often left out>

Verify: <the exact commands, and what passing looks like>

Acceptance: <a flat checklist. You will diff the result against exactly this list, so a
  criterion that is vague here becomes an argument later>
```

Favour detail over brevity. The brief's whole job is to let a cheaper model succeed without
guessing — every question it has to answer by guessing is a question you answer twice.

**A brief contains decisions, not options.** If you are still weighing alternatives, you are
not ready to dispatch. Decide first, or escalate to the user if it is theirs to decide.

## Standing constraints every brief adds

These are not in `CLAUDE.md`, or are there but get violated anyway. Include the ones that
apply.

**The reuse ladder.** Say which rung the work sits on, so the agent does the grep it would
otherwise skip. For each piece of behaviour: does it reuse an existing thing, extend one
with a parameter or a variant, or add something new — and if new, why the earlier rungs do
not hold. Adding a new function, or a new spec document, is the last resort. `pr-ready`
owns the full ladder.

**Never simplify away** input validation at a trust boundary, error handling, tenant
scoping, or authorisation. Minimal-diff pressure stops at those.

**Never silence a gate.** No suppression comment, no lowered threshold, no CI-config edit.
`check-conventions.sh` fails on newly added ones. Fix the content.

**Protected files are a hard stop.** `.github/workflows/**`, `harness.config.json`,
`CLAUDE.md`, `contracts/**` — the live list is in `harness.config.json`. Agent stages set
`HARNEXT_AGENT=1`, so an agent editing one fails rather than warns. `contracts/**` is the
test oracle: an agent that can weaken an assertion can make every gate green while the
behaviour is wrong. A contract that needs changing is an escalation back to the user.

**Confidence marking.** A claim about the predecessor is Observed or Inferred. A claim about
the rebuild is a decision, and says so — `01-tech-stack.md` and `09-roles-permissions.md`
set that pattern. Never promote an inference to fact without saying what settled it.

**Run `pr-ready` before returning.** Not optional and not a formality. A finding that
reaches the orchestrator instead costs a full dispatch-fix-review round trip; the same
finding caught inside the agent costs minutes in a session already running.

**Do not merge, and do not open the PR** unless the brief says to. Push the branch and
return.

## The return contract

Ask for a **summary, not a transcript** — findings, decisions, and what it could not do.
The diff is already on disk; you will read it there. An agent that pastes its work back
into your context defeats the reason it was dispatched.

Tell it to say plainly what it could not finish. A brief that only rewards success gets
optimistic reports, and an optimistic report is worse than a failure you can see.

## Review loop

1. Read the agent's report, then `git diff` for yourself. Cross-check the report's claimed
   `--stat` against what is actually there.
2. Re-run the verification yourself whenever the claim matters. Note that
   `check-conventions.sh` is diff-scoped against the merge-base and therefore **cannot see
   uncommitted work** — a green run on a dirty tree means nothing. Commit first.
3. Both lenses on the returned diff: `ponytail-review`, then `grain-review`. Consistency
   beats cuts where they disagree.
4. Corrections go back to the **same** agent via `SendMessage`.
5. Two failures for the same reason is a pattern. A third attempt is a loop — escalate.
