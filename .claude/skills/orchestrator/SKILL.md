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
the ones that are convenient. Then check the tier. Tier 1 (`docs/**`, `*.md`) may
self-merge. Tier 2 needs the review agent. **Tier 3 — tenant scoping, authorisation,
parsers, migrations — needs two human approvals and you may not merge it.** Comment what
is ready and leave it. Do not relabel a change to lower its tier; if you are tempted, that
is the signal it belongs in tier 3.

**Fixing a red PR.** Read the actual failure before touching anything. A gate that fails is
information. Never silence it — no suppression comment, no lowered threshold, no CI edit.
If the root cause is not understood, say so and escalate rather than patching around it.

**Closing a spec gap.** This is dirty-side work: read the mirror, answer the question,
update the spec document with the claim marked **Observed** or **Inferred**, and say what
changed it. If the mirror cannot answer it — the permission matrix and the parser formats
cannot be answered from it — escalate to the user. Do not infer and promote.

**Dispatching implementation.** Write the issue so a clean-side agent can finish it without
the mirror: the spec sections it implements, the contracts it is tested against, the
acceptance criteria, the tier. Then dispatch:

```bash
gh workflow run harnext-implement.yml -f issue=<n>
```

**Filing work.** Use the existing templates. Parent issues carry acceptance criteria;
children are tracer bullets, each one a single PR. Use the `to-issues` skill for
decomposition rather than hand-rolling it.

### 4. Record

The issue or PR thread is the ledger. Post what you decided and why — one short comment,
not a transcript. A future tick with none of this context must be able to pick up from it.

Then report to the user in three lines: what you found, what you did, what is next.

## Escalate, do not decide

Stop and ask the user when:

- A tier 3 change is ready to merge.
- A spec gap needs a product decision — the permission matrix, whether self-service
  registration and password reset return, how `User` ↔ `Organisation` scopes access.
- The mirror and the spec disagree. That is a finding, not a merge conflict.
- Something needs personal data, a real flight-log sample, or a credential to proceed.
- The same PR has failed twice for the same reason. Two failures is a pattern; a third
  attempt is a loop.

## Never

- Touch `.github/workflows/**` or `harness.config.json`.
- Read the mirror while writing application code, or in the same tick you write it.
- Put a pilot's name, an e-mail, a licence number or a 32-hex organisation token into any
  tracked file — including a test fixture, a commit message and a PR body.
- Merge your own tier 3 work, or approve on the user's behalf.
- Commit or push unless the tick's action was to land something.
