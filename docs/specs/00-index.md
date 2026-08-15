# TarmacView CAMO — Rebuild Specification

A behavioural and structural map of the existing CAMO / UAS fleet-log administration
application, produced by black-box inspection of the running system at
`camo.zephyruas.eu` (authenticated superadmin session, 14 Aug 2026).

This is a **reimplementation spec**, not a port. No source code, bundles, templates or
design assets were copied. Everything here was derived from observable behaviour:
rendered DOM, HTTP traffic, JSON payloads and framework metadata exposed by the running
app. Branding and visual design are explicitly out of scope — they are being defined
separately.

## Documents

| File | Contents |
|---|---|
| [01-tech-stack.md](01-tech-stack.md) | Framework fingerprint, versions, architectural consequences |
| [02-sitemap-routes.md](02-sitemap-routes.md) | Every discovered route, method, auth requirement |
| [03-data-model.md](03-data-model.md) | Entities, fields, types, relationships, ERD |
| [04-admin-resources.md](04-admin-resources.md) | The 13 admin resources: tables, filters, actions, forms |
| [05-organization-workspace.md](05-organization-workspace.md) | Organization editor + its 7 sub-registers |
| [06-org-report.md](06-org-report.md) | The operator-facing report screen and its endpoints |
| [07-flight-ingestion.md](07-flight-ingestion.md) | The three flight-import paths + mobile sync pipeline |
| [08-maps.md](08-maps.md) | Geozone map subsystem, KML layers, public access |
| [09-roles-permissions.md](09-roles-permissions.md) | Observed role vocabulary and access behaviour, plus the rebuild's decided matrix |
| [10-glossary-sk-en.md](10-glossary-sk-en.md) | Slovak → English domain terminology |

## What this app is

A CAMO (Continuing Airworthiness Management Organisation) tool for UAS/drone fleet
operators. It is **multi-tenant**: one deployment serves many operator organisations.
Its job is to keep an auditable record of:

- **Who flew** — pilots, their licences and recurrent training, with expiry tracking
- **What they flew** — aircraft register, per-airframe service intervals and maintenance log
- **What happened** — flight records imported from DJI logs, altitude/distance envelopes,
  VLOS violations, incident reports
- **Under what authority** — operator registration, SPECIFIC permits, insurance, flight
  permissions, operations manuals
- **Where they may fly** — geozone maps assembled from KML layers

The output artefact is the **organisation report** (`06-org-report.md`) — a
period-filtered, printable summary that is effectively the regulator-facing evidence pack.

## Method and confidence

Findings are marked throughout:

- **Observed** — directly seen in a response, payload or rendered form.
- **Inferred** — deduced from framework conventions or naming. Flagged inline.

Notes on how the data was obtained, because it affects how much you should trust it:

- The admin panel is built on a framework that exposes component class names and
  serialised component state in the HTML. Table columns, form fields, field types,
  validation attributes, helper text and action names were read from that directly, so
  the admin surface is documented with high confidence.
- Lazily-loaded sub-tables and modal forms were hydrated by replaying the app's own
  client-side load calls, then parsing the returned markup. Same confidence.
- Server-side validation rules are **not** exposed to the client. Constraints listed here
  come from HTML attributes (`required`, `min`, `max`, `maxlength`, `step`, `accept`) and
  helper text. Treat them as a floor, not the complete rule set.

## Deliberate gaps

These were left unverified on purpose, and should be closed before build:

1. **No write operations were performed.** This is a live production system holding real
   airworthiness records for several operator organisations. Nothing was created, edited
   or deleted. Request *shapes* for write endpoints are documented from the forms and
   client code that would send them; the actual server responses are not.
2. **Role differences were not tested.** The session used was a superadmin. Everything in
   `09-roles-permissions.md` about what a Pilot or Zodpovedný manažér sees is inferred
   from role names, UI helper text and route guards — not observed, and still unrecovered.
   The gap no longer blocks the build: that file now also carries the **rebuild's own**
   permission matrix, defined fresh as a decision on 15 Aug 2026 rather than reconstructed
   from here. What the predecessor's matrix was remains an open *migration* question.
3. **The mobile/device API was not enumerated.** The system clearly has one (token auth
   is installed, and there are registered controller devices, sync logs and an
   unlinked-flight queue). Its route prefix was not found by probing, and it should not
   be brute-forced against production. Recover it from the mobile app build or server
   route listing instead.
4. **Other tenants' data is excluded.** The deployment hosts several unrelated operator
   organisations. Their records were not catalogued and do not appear here.

## Personal data

The live system contains named pilots, their e-mail addresses, licence numbers and
certificate expiry dates. This spec documents **schema, not records** — no personal data
is reproduced. Sample values shown are placeholders. Keep it that way if you extend these
documents, since a rebuild spec circulates more widely than the system it describes.
