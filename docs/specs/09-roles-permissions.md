# 09 — Roles and permissions

**Read the caveat first.** What each role could *do* in the predecessor was never observed.
The inspection ran under a single superadmin session, so no role boundary was ever crossed.
The role vocabulary, that roles are multi-valued, and that a second organisation-scoped axis
exists — those are Observed. The scope of each role never was.

That gap is not closed by recovery. "The rebuild's permission model" below defines the
matrix fresh, and that is the half to build from.

## Two independent role axes

### 1. Global roles

Assigned on the user record (`/admin/users` → `Roly`, a required multi-select). Users hold
several at once — observed combinations include `Superadmin, Pilot`,
`Superadmin, Admin, Zodpovedný manažér`, `Admin, User`, `Pilot` alone, and none at all.

| Role | What was actually observed |
|---|---|
| **Superadmin** | The session used. Saw every organisation, the System sidebar group and the sync/audit resources — so cross-tenant reach is Observed for this role and this role only |
| **Admin** | The name. No boundary observed |
| **Zodpovedný manažér** | *Responsible Manager*, the accountable post in a CAMO organisation. The user form's own helper text: *"Organisation administrator with access to all organisation data. Responsible for operations, has access to flight statistics and …"* — truncated in the UI, so even this is partial |
| **Pilot** | The name, and that a pilot may exist with no login credentials (the creation form's credentials toggle) |
| **User** | The name. No boundary observed |

An account can hold **no** role at all — Observed. The rebuild answers what that means
below rather than inheriting it.

The multi-select and the naming convention are consistent with a standard Laravel
role/permission package *(inferred)*. If so, the predecessor's real permission set is finer
than these five labels. That matters for the migration, which must decide what each
existing account becomes; it no longer matters for the build, which stopped deriving its
matrix from here.

### 2. Organisation role (pivot)

Separate from global roles, set per organisation membership on the *Osoby organizácie*
register (doc 05): a required radio `Rola osoby v organizácii`, alongside a
`Hlavná kontaktná osoba` (primary contact) flag. `Zodpovedný manažér` appears here too.

So a user's authority is the combination of **what they are in the system** (global roles)
and **what post they hold in this organisation** (pivot role). The pivot register is
filterable by `Rola`, so multiple distinct post values exist — but the full option list
was not captured, because the radio options render from a server-side enum that was not
enumerated.

## Account provisioning

- **No self-service.** `/register`, `/forgot-password` and `/password/reset` all 404.
  Accounts are created by an admin, and password reset is a manual support operation.
  Decide deliberately whether to keep that; it is defensible for a compliance tool, but the
  missing reset path is a real operational cost.
- **Two provisioning routes with different rules.** Creating an *organisation person*
  requires e-mail and a password (≥8 chars, ≥1 letter, ≥1 digit). Creating a *pilot* does
  not — a `Vytvoriť prihlasovací účet` toggle decides whether credentials are issued.
  Accountable people are accounts; pilots are records.
- **Attach vs. create.** Both registers can attach an existing user instead of creating
  one, so users span organisations. The attach dialog warns that a user needs a real
  e-mail in order to log in.
- **Detach vs. delete.** Row actions are `Odobrať z organizácie` / `Odobrať z osôb
  organizácie` — membership is removed, the user record survives. Preserve that
  distinction; deleting a pilot would orphan flight history.

## Observed access behaviour

Only these are facts rather than inference:

- All `/admin/*` routes require a session; anonymous requests redirect to login.
- `/organization-reports/*` requires a session, including the JSON and print endpoints.
- `/map/*` and `/map/*/kml` serve **anonymously** — no session, no tenant scoping.
- `/` redirects an authenticated user to their own organisation's report.
- The report renders an `Administrácia` link into the admin panel; whether that is
  role-gated was not tested.
- The superadmin session saw all nine organisations and every tenant's users, devices and
  sync records, confirming cross-tenant reach for that role.

## The rebuild's permission model — decided

Everything above this line is what was Observed of the predecessor. Everything from here is
a **decision about the rebuild**, taken by the owner on 15 Aug 2026. It is defined fresh as
a product decision rather than reconstructed: the predecessor's matrix was never
observable, and waiting for it would block every slice downstream of authorisation.

The two-axis split is kept, because "what you are in the deployment" and "what post you hold
in this organisation" are genuinely different questions. The five combinable global roles
are not kept — multi-valued roles make deny-by-default hard to reason about, and every
observed combination is expressible as one system role plus a membership.

### Axis A — system role, one per person

| Role | Scope |
|---|---|
| `superadmin` | Cross-tenant. Every organisation, plus the system registers: device types, e-mail logs, mobile sync devices and log uploads |
| `member` | No cross-tenant access whatsoever. All authority derives from organisation memberships |

Every person carries exactly one. It is only consulted when they authenticate, so a person
with no credentials never exercises it.

Training types were a system register here until 15 Aug 2026. They are tenant-owned in the
rebuild and sit on the organisation surface under *Manage trainings* below — see
`03-data-model.md` §"Training types in the rebuild".

### Axis B — organisation role, one per membership

| Role | Intent |
|---|---|
| `accountable_manager` | The CAMO accountable post. Full read/write on the organisation, including people, documents, permits and occurrences. May provision accounts |
| `operations` | Day-to-day airworthiness work: assign flights, record maintenance, upload logs, manage aircraft and trainings. Cannot manage people or organisation-level documents |
| `pilot` | Reads own flights, own certificate and own training status. No writes |
| `viewer` | Read-only across the whole organisation. For auditors and regulators given temporary access |

### Capability matrix

| Capability | `accountable_manager` | `operations` | `pilot` | `viewer` |
|---|---|---|---|---|
| View organisation report | ✅ | ✅ | own rows only | ✅ |
| Assign pilot/aircraft to flight | ✅ | ✅ | ❌ | ❌ |
| Upload flight logs | ✅ | ✅ | ❌ | ❌ |
| Record maintenance | ✅ | ✅ | ❌ | ❌ |
| Manage aircraft register | ✅ | ✅ | ❌ | ❌ |
| Manage trainings | ✅ | ✅ | ❌ | ❌ |
| Manage permits & operations docs | ✅ | ❌ | ❌ | ❌ |
| File occurrence report | ✅ | ✅ | ✅ | ❌ |
| Manage people & memberships | ✅ | ❌ | ❌ | ❌ |
| Provision or reset an account | ✅ | ❌ | ❌ | ❌ |
| Manage geozone maps | ✅ | ✅ | ❌ | ❌ |

**Anything absent from this table is denied.** Deny-by-default is the rule, not the
fallback — a capability that needs adding is an edit to this table, never a special case in
a controller.

The table is the intent. The database is currently narrower for the two people rows — see
[03-data-model.md](03-data-model.md) §"The shared-organisation read in the rebuild".

It is also wider for *Manage trainings*, *Manage permits & operations docs*, *Manage aircraft
register*, *Assign pilot/aircraft to flight*, *Upload flight logs*, *File occurrence report*
and *Record maintenance*. The matrix and the database agree on **who** — the tenant — but the
policies behind `training_type`, `device`, `training`, `flight`, `flight_log`, `incident`,
`maintenance_log` and `document`'s tenant-owned buckets key off **membership, not organisation
role**, so Postgres admits a `pilot` or `viewer` membership the matrix denies. Narrowing it
needs a policy predicate over a per-membership role, which is the same missing piece the
people rows are waiting on.

The **global** document library is on no row of this table, and that is not an omission: it
carries no organisation, so no organisation role reaches it. Every session reads it and only
a superadmin writes it, which is Axis A — [03-data-model.md](03-data-model.md) §"The global
document library in the rebuild".

*Manage geozone maps* **is** on a row, and the database is narrower than it in a way the two
rows above are not: a map carries no organisation either, so neither `accountable_manager` nor
`operations` reaches one however the row reads. `map`'s `WITH CHECK` is a flat `superadmin`,
which is Axis A again — [03-data-model.md](03-data-model.md) §"Maps in the rebuild". Unlike
the people rows, this one is not waiting on a per-membership predicate: the assignment on
`map_organization` is a deployment-level act by design, so the row is what needs revisiting
rather than the policy.

The **admin panel** is off the table too, and unlike those two it is a *surface* rather than a
register: no row here answers *may this session reach `/admin`*. The rebuild gates it on Axis
A alone — deny-by-default and superadmin-only — until a per-membership predicate lands and a
narrower boundary can be drawn, which is [06-org-report.md](06-org-report.md) §"The report
page in the rebuild". That decides only what the rebuild does; what the predecessor did with
the link Observed above stays untested.

### Person is not account

The predecessor's own split, recorded under "Account provisioning" above, is kept
deliberately rather than inherited by accident:

- A **person** may exist with no e-mail and no credentials. That is the pilot register, and
  it is the normal case rather than an edge case.
- **Credentials** are a separate optional concern attached to a person.

### Sign-in and sign-out — decided

Also a **decision about the rebuild**, taken on 15 Aug 2026 by the rebuild loop under the
owner's standing autonomy grant, and recorded on issue #32. The owner has not reviewed it;
it is settled enough to build on and open enough to overturn, and that is the difference
between this and a decision they took themselves.

Only the path is Observed. The inspection was a GET-only crawl of an already authenticated
session, so it never fetched the sign-in page: the route table recorded that `/login`
exists and serves a public login form (doc 02 §Other) and nothing further — no fields, no
failure behaviour, no post-sign-in redirect. Everything below except the path is decided.

- **The path is `/login`.** Observed in doc 02, and the session gate and register pages
  already redirect there, so this ratifies both the evidence and what the code assumes.
  The predecessor is Slovak-only, so `/prihlasenie` would have been plausible had the
  crawl not settled it.
- **The gate's `next` parameter is honoured, and validated.** Only a single-slash-prefixed
  relative path is accepted — anything protocol-relative, carrying a scheme, carrying a
  backslash or carrying a control character falls back to `/`. An unvalidated one is an
  open redirect, which is how this feature usually goes wrong.
- **`/` redirects and renders nothing**, which is the shape doc 02 §Other observes on the
  predecessor. It lands on the acting session's **primary organisation report**, the
  destination the predecessor also sent people to. Which organisation that is derives from the
  primary-contact flag on the session's own membership and never from a column on the person —
  doc 03 §"Membership in the rebuild" decides that, and the person filter on the read is the
  security half of it: the policies admit every attachment to an organisation the acting person
  belongs to, and a superadmin's context admits the deployment's, so a read without it would
  land somebody on another operator's report. A session that is the primary contact of nothing
  keeps `/admin/device-types`, which is the ordinary case for a superadmin belonging to no
  organisation rather than an error; the device-type catalogue is deployment-wide (doc 03
  §DeviceType) and readable to every session, so the fallback is not a wall. Recorded on issues
  #35 and #104.
- **Every failure is one outcome.** A wrong password, an e-mail belonging to nobody and an
  account carrying no password are indistinguishable in the response, its wording and its
  timing. This is a security property rather than a preference: `person.email` is nullable
  and people legitimately exist in the register with no credentials, so a distinguishable
  rejection answers "is this address registered here" for several unrelated operators at
  once. The timing half is the auth library's — it hashes the submitted password before
  rejecting all three — and is a property of that version rather than of this decision.
- **Sign-out is a POST**, never a GET link, which any prefetch or embedded image would
  trigger. The rebuild has no `/logout` path: it is a server action, so doc 02's observed
  row is not carried over.
- **Signing in establishes who is calling and nothing more.** No role travels in the
  session; authority still comes from the person row and the matrix above.

### Consequences

- **Detach is not delete.** Removing a membership leaves the person and their flight
  history intact.
- **The database is deliberately narrower than this matrix on deletion.** *Manage people &
  memberships* is an `accountable_manager` capability, but deleting a person or a
  membership is a `superadmin` act today — see `03-data-model.md` §"Delete authority in the
  rebuild", which records that as awaiting an answer here rather than as settled.
- **A member reads the people they share an organisation with**, and writes none of them.
  Creating, editing and detaching a person or a membership is a `superadmin` act, so the
  gap above is the whole of that register's authority — see `03-data-model.md` §"The
  shared-organisation read in the rebuild".
- **A person with no membership sees nothing**, and remains a subject of records.
- **`superadmin` is the only cross-tenant path.** No organisation role reaches another
  organisation.
- **Row-level security keys off membership**, never off a column on the person — see
  `03-data-model.md`.

## Multi-tenancy

The deployment serves multiple unrelated operator organisations from one instance. Tenant
scoping is therefore a core security property, not a feature.

Two things to get right in the rebuild:

1. **Scope by default.** Every query on every organisation-owned entity — flights,
   devices, documents, incidents, trainings, sync uploads, e-mail logs — must be
   tenant-scoped unless the actor is a superadmin. Enforce it globally rather than
   per-controller.
2. **Users are not owned by one tenant.** The predecessor carries `User.organization_id`
   *and* a pivot (doc 03). The rebuild resolves that in favour of membership, so "which
   organisation's data may this person see" has exactly one answer to enforce.

## What is still open

The build no longer waits on the predecessor's matrix — it was replaced, not recovered. One
question still needs the database, and it is a *migration* question rather than a build one:
**what each existing account becomes.** Mapping five combinable global roles plus an
un-enumerated pivot enum onto two system roles and four organisation roles is a decision per
account, not a formula, and every existing account has to land somewhere.

Recovering it, in rough order of value:

1. **Read it from the database** — the roles and permissions tables, and the pivot's role
   column with its full option set. Fastest and authoritative.
2. **Read the policies** — if the original app used framework authorisation policies,
   their names survive in the resource classes even where source is gone.
3. **Test with real accounts** on a **non-production** copy. Least valuable of the three
   now: the answer no longer sets the rebuild's boundaries, only the migration's mapping.
