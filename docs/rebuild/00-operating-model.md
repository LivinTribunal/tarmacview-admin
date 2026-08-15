# 00 — Operating model for the rebuild

How the rebuild is actually driven: who reads what, what the agents are allowed to touch,
what counts as done, and where the loop lives.

`docs/specs/` describes **the predecessor**. This document describes **the process that
replaces it**. The two are kept apart on purpose.

## 1. The clean-room split

The rebuild has an observation copy of the predecessor — 384 captured resources, outside
every repository, described in the mirror's own README. It is the reason nobody needs to
open production again. It is also the single biggest risk to the clean-room constraint,
because transcribing markup is always easier than describing behaviour.

So the process is split, and the split is the load-bearing idea here:

| Side | Reads | Writes | Never |
|---|---|---|---|
| **Dirty** | The mirror | `docs/specs/`, `contracts/` | Application code |
| **Clean** | `docs/specs/`, `contracts/`, `CONTEXT.md` | Application code, tests | The mirror |

Between them sits an **airlock**: `contracts/`. Machine-readable, committed, scrubbed —
route tables, form-field inventories, the operator-report response schema. Derived from
the mirror by mechanical extraction, reviewed for personal data, then consumed by the
clean side as if the predecessor had never existed.

This is standard clean-room practice — an analyst team writes a behavioural spec, an
isolated implementation team builds only from that spec — and it survived legal scrutiny
in the cases that established it. Here it buys something more immediate: an implementer
that cannot see the original cannot accidentally copy it, and cannot leak a pilot's name
into a fixture.

**Enforcement, not etiquette.** The split holds only if it is mechanical:

- Implementer and reviewer agents run with the mirror path outside their working set.
- A conventions check fails any tracked file containing an absolute path into the mirror.
- `check-conventions.sh` already fails on predecessor e-mail addresses, licence-number
  patterns and any 32-hex string. Extraction into `contracts/` passes through it.
- Anything the clean side needs and cannot find is a **spec gap issue**, not a peek.

That last rule is what makes the whole thing work. The correct response to "the spec
doesn't say" is to file an issue and let a dirty-side agent answer it from the mirror.

## 2. The work ledger

GitHub Issues is the queue. Not a side file, not a plan in someone's context — issues,
because they survive a session ending, they are what the harnext workflows already key
off, and they are the only state both loops can see.

Shape:

- **Parent issues** carry a slice of product: one admin resource, the ingestion pipeline,
  the operator report. They hold the acceptance criteria and link the spec sections.
- **Child issues** are tracer bullets — independently grabbable, each one landing a thin
  vertical slice that a single agent can finish and a single PR can carry.
- **Spec-gap issues** use the existing template. They block the children that depend on
  them, and they are the only issues a dirty-side agent may resolve.

One issue per branch, squash merge, per the repo's PR conventions.

Three gaps block real implementation and are already known: the permission matrix, the
flight-log parser formats, and whether `User.organization_id` or the pivot scopes data
access. These become blocking spec-gap issues on day one. The orchestrator must not design
around them — the index says so, and guessing wrong on the third one propagates everywhere.

## 3. The two loops

**The driver** is a local Claude Code session on a self-paced loop. It holds the mirror,
the browser and the whole repo, and it is the only thing that makes decisions: what to
file, what to dispatch, what to merge, what to escalate. Its tick is in
`.claude/skills/orchestrator/SKILL.md`.

**The executor** is the existing harnext pipeline on the four-slot runner pool — triage,
plan, implement, review, verify, driven by issue and PR events. The driver dispatches into
it and reads results back; it does not reimplement it.

**The watchdog** is already scheduled: `harnext-stage-watchdog.yml`. It keeps the pipeline
unblocked when the local session is down. Between them the invariant is: *the driver may
be absent for a day without the queue rotting.*

Why both. A pure-CI orchestrator cannot drive Chrome, cannot read the quarantined mirror,
and burns a runner slot on every decision. A pure-local one stops when the laptop closes.
Splitting decision from execution keeps the expensive, judgement-heavy part where the
context is and the mechanical part where the parallelism is.

## 4. What "done" means

Long-running agents drift: they fixate on the last tool output, lose the original goal,
and declare completion early. The countermeasures are boring and they work — an explicit
definition of done, re-anchoring every tick, and a ledger the agent cannot silently edit.

An issue is done when **all** of the following hold. No exceptions, no partial credit:

1. Both gates pass locally and in CI — `check-conventions.sh`, `structural-tests.sh`.
2. The tests named in the issue exist, run, and fail if the behaviour is removed.
3. Its spec claims are marked Observed or Inferred, and nothing was promoted silently.
4. Both review lenses have run on the diff: `ponytail-review`, `grain-review`.
5. The PR body matches what the code actually does.
6. Nothing in the change touches `contracts/**` or any other protected file.

The owner has granted the loop full merge authority across all three tiers, including
tenant scoping, authorisation, parsers and migrations. That removes the human approval that
used to sit at tier 3, which means points 1–5 are no longer a formality — they are the
entire control. Nobody is reading these diffs before they land.

The single carve-out is the test oracle. `contracts/**` is a protected file: an agent that
can weaken an assertion can make every gate report green while the behaviour is wrong, and
that failure is invisible precisely because everything looks fine.

## 5. The quality system

The mirror's real value is not documentation. It is that it turns a rewrite into a
**verified** rewrite: recorded behaviour is a golden master, and the rebuild can be tested
against it rather than against someone's memory of it.

Five layers, cheapest first.

**Route contract.** `_meta/manifest.jsonl` is 384 URLs with status codes and auth
behaviour. Extract to `contracts/routes.json`: path pattern, method, auth expectation.
Test the rebuild against it — anonymous requests to session routes redirect, the three
public map routes stay public, and `/register`, `/forgot-password`, `/password/reset` stay
404. That last one is a deliberate product decision worth locking in a test so nobody
restores it by accident.

**Form contract.** Every mirrored create and edit page carries its field set in the markup:
input names, types, `required`, `min`, `max`, `maxlength`, `step`, `accept`. Extract to
`contracts/forms/<resource>.json` and assert the rebuilt form exposes the same fields with
at least the same constraints. This is the highest-yield mechanical test in the whole
programme — it converts thirteen resources' worth of tedious transcription into a
generated suite. Note the ceiling: these are client-side constraints, a floor for the real
server rules, and the spec index says so.

**Report schema parity.** The operator report is the product's face and `/data` is its
entire contract. Twenty-seven captured payloads (nine organisations × three periods)
become `contracts/report-schema.json` plus a set of aggregate invariants. Parity here is
**schema parity, not value parity** — the rebuild has its own database and its own records,
so asserting equal numbers is meaningless. Assert equal shape, equal key sets, equal types,
equal nesting, and that totals reconcile against their rows.

**Domain invariants.** The "domain rules that are easy to get wrong" list in `CLAUDE.md`
is already a test plan; it just needs to be written as one. One named suite each:

- a user with no e-mail and no password can exist and appear in the pilot register
- a flight can be created with neither pilot nor aircraft, and stays visible
- a failed parse is retained with its status and error, never dropped
- a duplicate sync upload reaches its dedicated state, not an error path
- a service interval fires on cycles *or* calendar months, whichever comes first
- one recorded flight is exactly one cycle
- maintenance readings are stored as stated and never recomputed on read
- an airframe with no device type reports "no limit configured", never a pass
- detaching a user from an organisation does not delete the user

Each of these is a defect that has somewhere to hide. Named tests drag them into the open.

**Tenant isolation.** Tier 3, and the one place where a bug is a breach rather than a
bug. Scoping is enforced globally, never per-controller, and the test is a property over
every organisation-owned model: an unscoped query returns only the current tenant's rows,
and a cross-tenant identifier returns not-found rather than forbidden, so the endpoint does
not confirm the record exists.

## 6. Sequence

Nothing above starts until the three blocking gaps are closed or explicitly deferred with
a decision recorded. After that:

1. **Airlock first.** Extract `contracts/` from the mirror. Cheap, mechanical, and it is
   what every later slice is tested against. Doing it first means no slice is ever written
   without a test to write against.
2. **Walking skeleton.** One vertical slice end to end — auth, tenancy, one resource,
   one test of each of the five layers. This is where the TypeScript stack proves itself,
   and where `01-tech-stack.md` gets rewritten from a fingerprint of the predecessor into
   a decision about the rebuild.
3. **The register resources.** Thirteen admin surfaces, contract-tested, parallelisable
   across runner slots because each is independent once the skeleton exists.
4. **Ingestion.** Blocked on real sample files. Three import paths and the sync pipeline.
5. **The operator report.** Last, deliberately. It is the screen users live in, it has the
   cleanest contract of anything in the system, and it deserves to be designed rather than
   ported.

## 7. Standing constraints

Carried from `CLAUDE.md` because these are the ones an autonomous loop erodes first:

- Never silence a gate. A suppression comment, a lowered threshold or a CI edit to make
  something pass is a failure of the run, not a fix.
- Never promote an Inferred claim to settled without saying what changed it.
- No personal data in the repo, on every edit, fixtures included.
- No AI attribution anywhere.
- Protected files stay untouched by agents: `.github/workflows/**`, `harness.config.json`,
  `CLAUDE.md`, `contracts/**`.
- **That protection is currently advisory in CI.** `check-conventions.sh` only makes a
  protected-file edit a hard failure when `HARNEXT_AGENT=1`, and no workflow sets it. Until
  one does, the oracle lock is a convention the loop is asked to honour rather than a gate
  that stops it. Setting that variable in the agent stages is the fix, and it means editing
  a protected workflow file, so it needs the owner.
- Root-cause over workaround. `--no-verify` is never the answer.
