# contracts — the airlock

Machine-readable behaviour extracted from the observation mirror. This directory is the
**only** thing that crosses from the dirty side to the clean side: agents that write
application code read these files and never the mirror. See
[../docs/rebuild/00-operating-model.md](../docs/rebuild/00-operating-model.md) §1.

Regenerate with:

```bash
node tools/extract-contracts.mjs <mirrorRoot> contracts
```

The mirror path is an argument, never hardcoded, so no tracked file points into a
directory full of personal data. The extractor fails with a non-zero exit if any output
file contains an organisation token, a predecessor e-mail address or a licence-number
pattern — the CI gate is the backstop, this is the airlock.

## What is here

| File | Contents |
|---|---|
| `routes.json` | 64 observed path patterns: methods, auth expectation, status codes, query params, content types. Plus the three routes confirmed **absent**, locked so nobody restores self-service registration by accident |
| `forms/<resource>.json` | Field name, control, type and validation attributes per create/edit form, for 8 of the 13 registers |
| `report-schema.json` | 109 key paths and types for the operator report's `/data` payload, from 27 sampled responses |

## Three things these contracts are not

**Not a data export.** Field names and constraints are interface; values are records. The
extractor never reads an element's `value`, `<option>` text or any text content, and masks
organisation tokens and record identifiers out of every path.

**Not value parity.** `report-schema.json` is a *shape*. The rebuild has its own database
and its own records, so asserting equal numbers would be meaningless. Assert equal key
sets, equal types, equal nesting, and that totals reconcile against their own rows.

**Not the complete rule set.** These are client-side constraints read from markup — a
floor for the real server-side validation, not a ceiling. `docs/specs/00-index.md` says
the same thing, and it still holds.

## How far a form contract goes

A field is anything bound to form state in the captured markup, by one of four bindings —
`name`, `wire:model`, a `data.*` id on the control or on a wrapper above it, or a
`data.*` path entangled into an element that is not a control at all. The last two are how
the predecessor's form layer carries a select, a file upload and a toggle, and the contract
records the element as it stands: the `maps` dark-basemap toggle is a `button` with
`role: switch`, not a checkbox. Each contract's `coverage` block counts the fields against
`controlsWithoutBinding`: controls carrying none of the four, which hold no form state and
are interface rather than fields.

Each contract claims to be *complete for the captured records*, never proven exhaustive.
Two things it does not cover:

- **A branch no captured record exercises.** `flights` renders on `entry_mode`, and every
  captured record shows the same branch, so a second field set behind the other one cannot
  be ruled out. Deciding that needs per-record values, which do not cross the airlock.
- **A field bound by some mechanism other than those four.** None appears anywhere in the
  capture, but that is absence of evidence: an extractor cannot detect a binding shape it
  does not know. It does announce an element whose binding is ambiguous rather than
  guessing at a name for it.

Five registers have no form contract at all, which is correct rather than missing —
`mobile-log-uploads`, `unlinked-mobile-flights` and `email-logs` are read-only,
`mobile-sync-devices` has no create route because records appear by device pairing, and
`microservices-page` is a custom page rather than a resource.

**Treat a known gap as an open question, never as a settled absence.** A form contract that
silently under-describes its form is worse than no contract, because the tests generated
from it would pass.
