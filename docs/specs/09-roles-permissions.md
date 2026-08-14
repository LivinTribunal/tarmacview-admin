# 09 — Roles and permissions

**Read the caveat first.** Everything about *what each role can do* in this document is
**inferred**. The inspection ran under a single superadmin session. No second account was
used, so no role boundary was actually observed. Do not build a permission matrix from
this file alone — see "Closing the gap" at the end.

What *is* observed: the role vocabulary, that roles are multi-valued, and that a second
organisation-scoped role axis exists.

## Two independent role axes

### 1. Global roles

Assigned on the user record (`/admin/users` → `Roly`, a required multi-select). Users hold
several at once — observed combinations include `Superadmin, Pilot`,
`Superadmin, Admin, Zodpovedný manažér`, `Admin, User`, `Pilot` alone, and none at all.

| Role | Slovak | Inferred scope |
|---|---|---|
| **Superadmin** | Superadmin | Full cross-tenant access. Sees every organisation, the System sidebar group, and the sync/audit resources |
| **Admin** | Admin | Administrative access, most likely scoped to own organisation |
| **Zodpovedný manažér** | Zodpovedný manažér | *Responsible Manager* — the accountable post in a CAMO organisation. Per the user form's own helper text: *"Organisation administrator with access to all organisation data. Responsible for operations, has access to flight statistics and …"* (truncated in the UI) |
| **Pilot** | Pilot | Flight-log subject; may or may not have login credentials at all |
| **User** | User | Baseline authenticated user |

That an account can have **no** role is worth noting — decide what that means rather than
inheriting it.

The multi-select and the naming convention are consistent with a standard Laravel
role/permission package *(inferred)*. If so, the underlying permission set is finer than
these five labels and should be recovered from the database, not guessed.

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

## Multi-tenancy

The deployment serves multiple unrelated operator organisations from one instance. Tenant
scoping is therefore a core security property, not a feature.

Two things to get right in the rebuild:

1. **Scope by default.** Every query on every organisation-owned entity — flights,
   devices, documents, incidents, trainings, sync uploads, e-mail logs — must be
   tenant-scoped unless the actor is a superadmin. Enforce it globally rather than
   per-controller.
2. **Users are not owned by one tenant.** `User.organization_id` exists *and* users attach
   to organisations through a pivot (doc 03). Resolve that ambiguity explicitly, because
   "which organisation's data may this user see" depends on the answer.

## Closing the gap

The permission model is the one part of this spec that cannot be responsibly inferred.
Recover it directly, in rough order of value:

1. **Read it from the database** — the roles and permissions tables, and the pivot's role
   column with its full option set. Fastest and authoritative.
2. **Read the policies** — if the original app used framework authorisation policies,
   their names survive in the resource classes even where source is gone.
3. **Test with real accounts** — log in as a Pilot, an Admin and a Zodpovedný manažér on a
   **non-production** copy and record what each sees: which sidebar entries, which
   organisations, which row actions, which report sections.

Until then, treat every "inferred scope" line above as a hypothesis. Build the rebuild's
permission layer deny-by-default, and let the recovered matrix open it up.
