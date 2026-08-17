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
  aircraft, flights, documents, permits, forms and incidents; people attach to it through a
  membership. Carries the operator's regulatory identity (registration number, SPECIFIC
  permit, insurance validity) and its expiry-warning threshold. Deleting one is **blocked
  while dependents exist** rather than cascaded, and is a `superadmin` act even when there
  are none — two independent controls; see `docs/specs/03-data-model.md`.
- **Organisation workspace** — the admin screen for one operator: the organisation form and
  seven tabbed sub-registers below it, addressed as `?activeRelationManager={n}`. A tab's
  read names the organisation it is showing, and that is a **selection and never a
  boundary** — tenant scoping decides which rows the session may see at all, the tab decides
  which of them it is looking at. See
  [docs/specs/05-organization-workspace.md](docs/specs/05-organization-workspace.md)
  §"The workspace in the rebuild".
- **Tenant-owned / deployment-wide** — which side of the ownership chain an entity sits on.
  A tenant-owned entity carries `organization_id` and is tenant-scoped; a deployment-wide
  one is neither, and its register is a **system register** maintained by `superadmin`.
  Which side a register falls on is decided per register — see
  `docs/specs/03-data-model.md`.
- **Device** — one airframe, identified by serial number. Owns its maintenance history and
  is the subject of service scheduling.
- **Flight** — one recorded flight. Owns its flight logs; may be linked to an incident.

## People

- **Person** — the human record, and the subject of flight history, membership and
  certification. A person may exist with **no e-mail and no password** — that is a pilot who
  is a subject of flight records but cannot log in. Any rule that makes e-mail required or
  unconditionally unique breaks the pilot register. In the rebuild, credentials are a
  separate optional `auth_user` row attached to a person rather than columns on it; the
  predecessor combined the two — see `docs/specs/03-data-model.md`.
- **Pilot** — a person who flies. Rostered per organisation; may hold certificates and
  training. Login credentials are optional and issued deliberately.
- **Responsible Manager** — the accountable post in a CAMO organisation, and a distinct
  concept from a system administrator. Holds administrative authority over one
  organisation's data. The rebuild's organisation role for it is `accountable_manager`.
- **Organisation membership** — the attachment of a person to an organisation, carrying the
  post held (**organisation role**) and whether they are the **primary contact**. Distinct
  from the system role. In the rebuild it is a first-class table and the thing tenant
  scoping keys off, never a column on the person — including the reach one person has over
  another, since a member reads the people they **share an organisation** with and nobody
  else; see `docs/specs/03-data-model.md`.
- **Organisation role** — the post held in one organisation, one per membership:
  `accountable_manager`, `operations`, `pilot`, `viewer`.
- **System role** — deployment-wide authority, exactly one per person: `superadmin`
  (cross-tenant) or `member` (none whatsoever). Authority is the combination of the system
  role and the person's memberships. The predecessor instead had five *combinable* global
  roles — Superadmin, Admin, Responsible Manager, Pilot, User — and that vocabulary now
  survives only in the migration.
- **Acting session** — the resolved identity a scoped read runs under: the person id plus
  the system role, read from the `person` row rather than trusted from the session, so a
  session cannot claim an authority it does not hold. In code: `actingSession()` in
  `src/lib/auth/session.ts`. `src/middleware.ts` decides who reaches a page; the acting
  session decides what the database is told about them, and the two are not the same
  boundary — see `docs/specs/09-roles-permissions.md`.
- **Attach / detach** — adding or removing a person's membership of an organisation. Never
  deletes the person; deleting a pilot would orphan flight history. Distinct from delete
  everywhere in the UI and should stay so.
- **Account provisioning** — issuing or resetting a person's login credentials. Always
  administered, never self-served: there is no registration or password-reset path.
  Creating a person and giving them an account are separate acts, and credentials with no
  e-mail address are refused rather than stored — see `docs/specs/03-data-model.md`.

## Certification & training

- **Certificate (osvedčenie)** — a pilot's competency certificate: a number, its
  certificate types, and an expiry date. **No certificate type recorded** is a real state;
  surface that gap, never let it read as a pass — see `docs/specs/03-data-model.md`.
- **Training** — a recurrent or initial training record held by a pilot, optionally
  scoped to specific airframes. May carry no expiry, which is a real state, not a missing
  value. The airframes it is scoped to are the operator's own, enforced by the schema and
  not by a policy — see `docs/specs/03-data-model.md`.
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
  per-organisation, and **maintained by `superadmin` in the database and not only by
  convention** — see [docs/specs/03-data-model.md](docs/specs/03-data-model.md) §"Catalogue
  write authority in the rebuild".
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
- **Maximum distance / total distance** — two different figures a flight carries. Maximum
  distance is how far the aircraft got **from the pilot**, and is the one the VLOS violation
  is judged on; total distance is the length of the track flown. Judging a violation on the
  track length reads as a violation for any long survey flight flown within sight, and as a
  pass for a short one flown straight out past the limit — see
  `docs/specs/03-data-model.md`.
- **Assignment** — attaching a pilot and an airframe to a flight after import. A flight may
  legitimately exist with neither; automated ingest cannot know who was flying. Assignment
  is a first-class later step, not a creation-time requirement.
- **Parsing status** — the outcome of importing a source file. A file that failed to parse
  is **retained**, not dropped: a failed import is still evidence that a flight happened.
- **Unassigned flight queue** — the triage backlog of synced flights with no pilot or
  airframe. A permanent part of the workflow, not a defect state.

## Documents

- **Bucket** — which of the four document registers a document belongs to. It is a
  discriminator on the row rather than a field on the form — see
  `docs/specs/03-data-model.md`.
- **Global document library** — the deployment-wide bucket, carrying no organisation. Every
  session reads it and only a superadmin writes it, the same split the device-type catalogue
  carries. See [docs/specs/03-data-model.md](docs/specs/03-data-model.md) §"The global
  document library in the rebuild".
- **Operations documentation** — the operator's standing compliance pack: operations
  manual, emergency response procedures, checklists, insurance, registration.
- **Flight permit** — an authorisation document for specific flights. The only document
  class carrying a public flag, which exposes it on the organisation report.
- **Form** — a blank form the operator distributes or files.
- **Incident (occurrence)** — a reported occurrence, optionally linked to the flight that
  caused it, recording whether persons were injured.
- **Stored file** — bytes on disk under the **storage root**, named by a path column on the
  row that owns them. Never a static path: it is served only through a handler that read
  that row first, so it inherits the row's tenant scoping. See
  [docs/specs/03-data-model.md](docs/specs/03-data-model.md) §"Serving a stored file in the
  rebuild".

## Geozones

- **Geozone** — an airspace restriction area. Assembled from KML layers, each typed and
  colour-coded: NO FLY (with buffer), aerodrome rings, CTR, ATZ, restricted areas,
  protected landscape areas.
- **Map assignment** — the link between a map and the operators it is offered to. A map is
  deployment-wide and owned by no operator; the assignment decides **which tenants see it in
  their report**, never who may reach it. It is not an access control. See
  [docs/specs/03-data-model.md](docs/specs/03-data-model.md) §"Maps in the rebuild".
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
