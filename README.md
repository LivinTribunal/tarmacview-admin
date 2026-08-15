# TarmacView Admin — CAMO & Fleet-Log Administration

**Website:** <https://www.tarmacview.com/>

A CAMO (Continuing Airworthiness Management Organisation) and fleet-log administration
platform for UAS operators. Multi-tenant: one deployment serves many operator
organisations, each keeping an auditable record of who flew, what they flew, what
happened, and under what authority.

Companion to **[TarmacView](https://github.com/LivinTribunal/tarmacview)** — that product
plans and validates inspection missions; this one keeps the continuing-airworthiness
record around them.

---

## Status

**This repository currently contains the rebuild specification, not the application.**

The predecessor system exists and runs in production, but its source repository was lost.
This repo starts from a clean-room behavioural specification reconstructed by black-box
inspection of the running system, and the application is rebuilt from that spec under the
TarmacView brand with its own design.

No source, bundles, templates or design assets were carried over. Everything in
`docs/specs/` was derived from observable behaviour — rendered markup, HTTP traffic, JSON
payloads and framework metadata. See [docs/specs/00-index.md](docs/specs/00-index.md) for
the method, confidence marking, and the gaps that are deliberately still open.

## What this is

UAS operators flying under EASA's SPECIFIC category carry a continuing-airworthiness
obligation: they must be able to show, on demand, that every flight was flown by a
currently-certified pilot, on an airframe that was inside its service interval, under a
valid operating authorisation, with occurrences reported. Most operators discharge this
with spreadsheets and a shared drive, which does not survive an audit.

TarmacView Admin makes that record a system of record:

- **Who flew** — pilot roster, competency certificates and recurrent training, with expiry
  warning thresholds per organisation
- **What they flew** — aircraft register, per-type service intervals tracked on both flight
  cycles and calendar months, and a maintenance log that resets the baseline
- **What happened** — flights imported from DJI logs, agricultural spray exports or manual
  entry; altitude and distance envelopes; VLOS-violation detection; occurrence reports
- **Under what authority** — operator registration, SPECIFIC permits, insurance validity,
  flight permissions, operations manuals
- **Where they may fly** — geozone maps assembled from KML layers (NO FLY, CTR, ATZ, LZR,
  protected landscape areas)

The output artefact is the **organisation report** — a period-filtered, printable summary
that is effectively the regulator-facing evidence pack.

## What you do with it

1. **Pilot / operator** — works in the organisation report: uploads flight logs, assigns
   pilots and aircraft to imported flights, records maintenance, reads the current
   compliance picture, prints the period report.
2. **Responsible Manager** — the accountable post in a CAMO organisation. Curates the
   organisation's registers: people, pilots, aircraft, operations documentation, permits,
   forms, occurrence reports.
3. **System administrator** — manages tenants, the airframe-type and training-type
   catalogues, geozone maps, and the device-sync fleet across all organisations.

## Architecture

TypeScript on Next.js, with Postgres row-level security carrying tenant isolation — decided
15 Aug 2026, deliberately against the predecessor's shape.
[docs/specs/01-tech-stack.md](docs/specs/01-tech-stack.md) records the full choice, what it
costs, and the fingerprint it was taken against.

The operator report is the product's real face and has a small, explicit contract (one JSON
endpoint plus a handful of REST actions), so it can be built independently of whatever the
admin panel runs on.

## Repository structure

```
docs/
  specs/          the rebuild specification — read 00-index.md first
  rebuild/        how the rebuild is driven: operating model, risk tiers
contracts/        machine-readable route, form and report contracts — the test oracle
CONTEXT.md        domain glossary — the canonical vocabulary
CLAUDE.md         conventions for agents and contributors
harness.config.json  risk-tier configuration
```

Application code lands alongside these, starting with the walking skeleton.

## Documentation

| Doc | Purpose |
|-----|---------|
| **[docs/specs/00-index.md](docs/specs/00-index.md)** | **Start here.** Scope, method, confidence marking, open gaps |
| [docs/specs/01-tech-stack.md](docs/specs/01-tech-stack.md) | Predecessor fingerprint, and the rebuild's own stack decision |
| [docs/specs/02-sitemap-routes.md](docs/specs/02-sitemap-routes.md) | Every route, method, auth requirement |
| [docs/specs/03-data-model.md](docs/specs/03-data-model.md) | Entities, fields, relationships, ERD |
| [docs/specs/04-admin-resources.md](docs/specs/04-admin-resources.md) | Admin resources: tables, filters, actions, forms |
| [docs/specs/05-organization-workspace.md](docs/specs/05-organization-workspace.md) | Organisation editor and its seven registers |
| [docs/specs/06-org-report.md](docs/specs/06-org-report.md) | The operator report and its endpoint contract |
| [docs/specs/07-flight-ingestion.md](docs/specs/07-flight-ingestion.md) | The four flight-import paths |
| [docs/specs/08-maps.md](docs/specs/08-maps.md) | Geozone map subsystem and KML layers |
| [docs/specs/09-roles-permissions.md](docs/specs/09-roles-permissions.md) | Observed role vocabulary, and the rebuild's decided permission matrix |
| [docs/specs/10-glossary-sk-en.md](docs/specs/10-glossary-sk-en.md) | Slovak → English domain terminology |
| [CONTEXT.md](CONTEXT.md) | Domain glossary — the vocabulary used across code, issues and prose |

## Before building

Three things were expensive to guess wrong. Two are now decided, as of 15 Aug 2026:

1. **The permission model** — defined fresh rather than recovered, deny-by-default, in
   [09-roles-permissions.md](docs/specs/09-roles-permissions.md). What the predecessor's own
   matrix was is still unrecovered, and it is now only a migration question.
2. **The user/organisation relationship** — decided in favour of membership, in
   [03-data-model.md](docs/specs/03-data-model.md).
3. **The flight-log parsers** — still open. The DJI `.txt` parser and the agricultural XLSX
   layout are server-side and were not observable. Get sample files and keep them as
   fixtures. This blocks ingestion, and only ingestion.

## Personal data

The predecessor holds named pilots, e-mail addresses, licence numbers and certificate
expiry dates for several real operator organisations. The specification documents **schema,
not records** — no personal data is reproduced, and sample values are placeholders. Keep it
that way when extending these documents.

## Copyright

© 2026 Štefan Moravík. All rights reserved.

A TarmacView product — proprietary, and deliberately unlicensed. No licence is granted
for use, copying, modification, or redistribution. This is not thesis work and not open
source; the sibling [TarmacView](https://github.com/LivinTribunal/tarmacview) repository
is a separate matter with its own licensing.
