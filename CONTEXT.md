# CONTEXT — Domain Glossary

TarmacView Admin is a CAMO and fleet-log administration platform for UAS operators. This
file is the living glossary of the project's domain vocabulary. When agents or contributors
name a concept — in issue titles, refactor proposals, test names, comments — they should
use the term defined here.

The full data model lives in `docs/specs/03-data-model.md`. The Slovak vocabulary of the
predecessor system, which is the source of most of these terms, is in
`docs/specs/10-glossary-sk-en.md`. This file is the **vocabulary** layer; the spec is the
**schema** layer.

---

## Regulatory frame

- **CAMO (Continuing Airworthiness Management Organisation)** — the regulatory role this
  product serves. The obligation to show, on demand, that every flight was flown by a
  certified pilot on a serviceable airframe under a valid authorisation.
- **UAS (Unmanned Aircraft System)** — the aircraft. Used in preference to "drone"
  throughout, matching the regulatory term and the predecessor's UI.
- **SPECIFIC** — the EASA operational category above Open, requiring an explicit operating
  authorisation. An organisation's SPECIFIC permit number and operation type are part of
  its identity.
- **VLOS / BVLOS** — Visual Line of Sight / Beyond Visual Line of Sight. The operation type
  on the organisation, and the per-airframe distance limit against which flights are
  checked.
- **A1/A3, A2, STS** — Open-category and Standard-Scenario pilot competency certificates. A
  pilot holds one or more.

## Aggregate roots

- **Organization** — the tenant, and the top of nearly every ownership chain. Owns
  aircraft, flights, documents, permits, forms and incidents; users attach to it through a
  membership. Carries the operator's regulatory identity (registration number, SPECIFIC
  permit, insurance validity) and its expiry-warning threshold.
- **Device** — one airframe, identified by serial number. Owns its maintenance history and
  is the subject of service scheduling.
- **Flight** — one recorded flight. Owns its flight logs; may be linked to an incident.

## People

- **User** — serves as both login account and pilot record. A user may exist with **no
  e-mail and no password** — that is a pilot who is a subject of flight records but cannot
  log in. Any rule that makes e-mail required or unconditionally unique breaks the pilot
  register.
- **Pilot** — a user who flies. Rostered per organisation; may hold certificates and
  training. Login credentials are optional and issued deliberately.
- **Responsible Manager** — the accountable post in a CAMO organisation, and a distinct
  concept from a system administrator. Holds administrative authority over one
  organisation's data. The rebuild's organisation role for it is `accountable_manager`.
- **Organisation membership** — the attachment of a user to an organisation, carrying the
  post held (**organisation role**) and whether they are the **primary contact**. Distinct
  from the system role. In the rebuild it is a first-class table and the thing tenant
  scoping keys off, never a column on the person.
- **Organisation role** — the post held in one organisation, one per membership:
  `accountable_manager`, `operations`, `pilot`, `viewer`.
- **System role** — deployment-wide authority, exactly one per person: `superadmin`
  (cross-tenant) or `member` (none whatsoever). Authority is the combination of the system
  role and the person's memberships. The predecessor instead had five *combinable* global
  roles — Superadmin, Admin, Responsible Manager, Pilot, User — and that vocabulary now
  survives only in the migration.
- **Attach / detach** — adding or removing a user's membership of an organisation. Never
  deletes the user; deleting a pilot would orphan flight history. Distinct from delete
  everywhere in the UI and should stay so.

## Certification & training

- **Certificate (osvedčenie)** — a pilot's competency certificate: a number, one or more
  certificate types, and an expiry date.
- **Training** — a recurrent or initial training record held by a pilot, optionally
  scoped to specific airframes. May carry no expiry, which is a real state, not a missing
  value.
- **Training type** — the training taxonomy (initial, operational training, ERP, and the
  certificate-shaped types). Carries a code, unique **per organisation**: the taxonomy is
  an operator's own syllabus rather than a deployment-wide catalogue, so two operators may
  hold the same code — see `docs/specs/03-data-model.md`.
- **Expiry warning window** — the per-organisation number of days before a certificate or
  training lapses at which the report raises an amber warning. Defaults to 40.

## Aircraft & airworthiness

- **Device type** — the airframe catalogue entry that drives service scheduling and the
  VLOS limit. An airframe with **no device type has no service intervals and no VLOS
  limit**, so service tracking and violation detection silently do nothing for it. Surface
  that gap; never let it read as a pass. The catalogue is deployment-wide rather than
  per-organisation, maintained by `superadmin` — see `docs/specs/03-data-model.md`.
- **Cycle** — one recorded flight. The unit of cycle-based service intervals.
- **Service interval** — the maintenance period, expressible two ways at once: in cycles
  and in calendar months. When both are set, **whichever limit is reached first** triggers
  the warning. In code: `serviceState()` in `src/lib/devices/service-schedule.ts`.
- **Service baseline** — the cycle count and date at last maintenance, from which the next
  service is measured. Logging maintenance resets it.
- **Maintenance log** — a record of service performed, capturing the flight hours and
  cycle count **as stated by the technician at the time of service**, not recomputed. It
  records what was certified, which is the point of it.
- **VLOS violation** — a flight whose maximum distance from the pilot exceeded the
  airframe's VLOS limit. Derived at read time, not stored.

## Flights

- **Flight log** — a leg or sampling window within a flight, parsed from the source file.
  One flight has many. The flight is the unit of record; the log is the detail.
- **Entry mode** — which of the import paths created a flight: DJI text log, agricultural
  spreadsheet export, manual entry, or controller sync.
- **Assignment** — attaching a pilot and an airframe to a flight after import. A flight may
  legitimately exist with neither; automated ingest cannot know who was flying. Assignment
  is a first-class later step, not a creation-time requirement.
- **Parsing status** — the outcome of importing a source file. A file that failed to parse
  is **retained**, not dropped: a failed import is still evidence that a flight happened.
- **Unassigned flight queue** — the triage backlog of synced flights with no pilot or
  airframe. A permanent part of the workflow, not a defect state.

## Documents

- **Operations documentation** — the operator's standing compliance pack: operations
  manual, emergency response procedures, checklists, insurance, registration.
- **Flight permit** — an authorisation document for specific flights. The only document
  class carrying a public flag, which exposes it on the organisation report.
- **Form** — a blank form the operator distributes or files.
- **Incident (occurrence)** — a reported occurrence, optionally linked to the flight that
  caused it, recording whether persons were injured.

## Geozones

- **Geozone** — an airspace restriction area. Assembled from KML layers, each typed and
  colour-coded: NO FLY (with buffer), aerodrome rings, CTR, ATZ, restricted areas,
  protected landscape areas.
- **Layer type** — the geozone classification, which fixes the legend colour. Colour is
  bound to type, not chosen per file, so the legend stays consistent across maps.
- **Layer priority** — draw order; higher is on top. Together with the geozone flags it
  defines click resolution.
- **Non-geozone layer** — a layer shown as supplementary information rather than a
  containing zone.
- **No-geozone default** — a layer shown only when the clicked point falls inside no
  geozone at all — the "unrestricted airspace" case.

## Sync

- **Controller (ovládač)** — a registered ground controller running the companion app,
  which pushes flight logs automatically. Can be **blocked**, which is the containment
  control for a lost or compromised device; failed attempts are counted.
- **Sync upload** — one file pushed by a controller, with its own status. **Duplicate is an
  expected outcome, not an error** — controllers re-upload, and the model has a dedicated
  state for it.

## Reporting

- **Organisation report** — the operator-facing screen and the product's real face. A
  period-filtered compliance summary over pilots, aircraft and flights, printable as the
  regulator-facing evidence pack.
- **Period** — the report's time filter: this month, last month, or a custom range. It
  flows through to the printed output so the document matches the screen.

---

## Conventions for adding to this glossary

- One concept per bullet, defined in one or two sentences.
- If a concept has a value-object or method-level definition in code, name it.
- If the concept has a deeper authoritative definition in `docs/specs/`, reference that doc
  rather than duplicating it.
- New concepts should be added when they appear in two or more places — issue title, code,
  conversation — without an agreed-on name yet.
- Prefer the regulatory term over the colloquial one (UAS not drone, occurrence not
  accident), because that is the vocabulary the users and their auditors already speak.
