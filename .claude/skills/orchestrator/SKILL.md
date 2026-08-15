---
name: orchestrator
description: One tick of the rebuild orchestration loop - assess the ledger, decide the single most valuable next action, dispatch it, record it. Drives issues, the harnext pipeline and merges for the clean-room rebuild. Use when the user runs /loop with this skill, says "orchestrate", "run a tick", or asks what the rebuild should do next.
disable-model-invocation: true
---

# orchestrator

One **tick**. Not a sprint, not a session — assess, decide, act once, record, stop. The
loop calls you again. An agent that tries to finish the whole rebuild in one tick is the
failure mode this skill exists to prevent.

Read `docs/rebuild/00-operating-model.md` first if it is not already in context. It defines
the clean-room split, the ledger and the definition of done. This skill is how those get
applied; it does not restate them.

## Before anything: re-anchor

Long-running loops drift toward whatever the last tool output was about. So begin every
tick by writing, in two sentences:

- **The objective.** A clean-room TypeScript rebuild of the CAMO administration system,
  verified against the mirror's contracts, at a quality bar where every claim is marked
  and every gate is real.
- **Where we are.** Which phase of §6 of the operating model, and what is blocking.

If those two sentences disagree with what you are about to do, do the other thing.

## The tick

### 1. Assess

```bash
gh issue list --state open --json number,title,labels,assignees --limit 100
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision
git -C . status --short && git log --oneline -5
```

Read, in this order, and stop at the first that yields work:

1. **A PR that is green and mergeable.** Landing work beats starting work.
2. **A PR that is red.** A broken PR blocks its issue and rots. Fix or close it.
3. **A blocking spec-gap issue.** Nothing downstream is safe while one is open.
4. **The next unblocked child issue** in phase order.
5. **Nothing.** Say so and end the tick. A quiet tick is a valid tick — do not invent work.

### 2. Decide one action

One. If two things look equally valuable, take the one that unblocks more issues.

Bias, in order: **land > unblock > verify > build > plan > file**. A loop that only files
issues produces a backlog and no product; a loop that only builds produces an unreviewed
pile. The bias list is the corrective.

### 3. Act

**Landing a PR.** Confirm the definition of done in the operating model §4 — all six, not
the ones that are convenient. Then merge. The owner has granted full merge authority
across all three tiers, so nothing here waits on a human approval.

That authority is the reason to be *more* careful, not less. Nobody is reading these
diffs before they land, so the review agent and the check set are the only thing between a
mistake and `main`. Two rules keep that honest:

- **Never modify `contracts/**`.** It is the test oracle and it is a protected file. An
  agent that can weaken an assertion can make every gate report green while the behaviour
  is wrong. A contract that needs changing is an escalation, always — including for
  issue #9, which you must hand back rather than do.
- **Never relabel a change to lower its tier.** If you are tempted, that is the signal it
  belongs in the higher one.

**Fixing a red PR.** Read the actual failure before touching anything. A gate that fails is
information. Never silence it — no suppression comment, no lowered threshold, no CI edit.
If the root cause is not understood, say so and escalate rather than patching around it.

**Closing a spec gap.** This is dirty-side work: read the mirror, answer the question,
update the spec document with the claim marked **Observed** or **Inferred**, and say what
changed it. If the mirror cannot answer it — the permission matrix and the parser formats
cannot be answered from it — escalate to the user. Do not infer and promote.

**Dispatching implementation.** Write the issue so a clean-side agent can finish it without
the mirror: the spec sections it implements, the contracts it is tested against, the
acceptance criteria, the tier. Then dispatch at the **plan** stage, so the implementer is
handed a plan instead of designing from the issue text:

```bash
gh workflow run harnext-plan.yml -f issue_number=<n>
```

For work that is not issue-shaped, delegate to an in-session agent instead. The rule for
choosing between the two, and the brief template, are in
`.claude/skills/rebuild/delegation.md`.

**Filing work.** Use the existing templates. Parent issues carry acceptance criteria;
children are tracer bullets, each one a single PR. Use the `to-issues` skill for
decomposition rather than hand-rolling it.

### 4. Record

The issue or PR thread is the ledger. Post what you decided and why — one short comment,
not a transcript. A future tick with none of this context must be able to pick up from it.

Then report to the user in three lines: what you found, what you did, what is next.

## Escalate, do not decide

Stop and ask the user when:

- A change needs to touch `contracts/**`, or any other protected file.
- A spec gap needs a product decision that has not already been made.
- A flight-log parser is about to affect real records. The parsers are built from public
  format documentation, not from verified samples, so their claims stay **Inferred**, they
  ship behind a flag that is off by default, and nothing writes to the flight record until
  one real log file has been through them.
- The mirror and the spec disagree. That is a finding, not a merge conflict.
- Something needs personal data, a real flight-log sample, or a credential to proceed.
- The same PR has failed twice for the same reason. Two failures is a pattern; a third
  attempt is a loop.

## Never

- Touch `.github/workflows/**`, `harness.config.json`, `CLAUDE.md` or `contracts/**`.
- Read the mirror while writing application code, or in the same tick you write it.
- Put a pilot's name, an e-mail, a licence number or a 32-hex organisation token into any
  tracked file — including a test fixture, a commit message and a PR body.
- Silence a gate, lower a threshold, or weaken a test to make something pass. With no
  human reading the diffs, this is the failure that would go unnoticed longest.
- Commit or push unless the tick's action was to land something.
