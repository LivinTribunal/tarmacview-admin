# 02 — Sitemap and routes

`{org}` = the organisation's 32-char hex token (see `01-tech-stack.md`).
Auth column: **Session** = redirects to login when anonymous (verified);
**Public** = serves anonymously (verified).

## Admin panel

All under `/admin`, all session-authenticated. Each row is a Filament resource with the
conventional index / create / edit route triple unless noted.

| Route | Resource class (observed) | Purpose |
|---|---|---|
| `/admin/organizations` | `OrganizationResource` | Tenant register; entry point to the org workspace |
| `/admin/organizations/create` | ↳ `CreateOrganization` | |
| `/admin/organizations/{org}/edit` | ↳ `EditOrganization` | Org details + 7 sub-registers (doc 05) |
| `/admin/users` | `UserResource` | Global user register |
| `/admin/users/create` · `/admin/users/{id}/edit` | | Edit page carries a Trainings sub-table |
| `/admin/flights` | `FlightResource` | All imported flights |
| `/admin/flights/create` · `/admin/flights/{id}/edit` | | Edit page carries a Flight-logs sub-table |
| `/admin/trainings` | `TrainingResource` | Pilot training records |
| `/admin/trainings/create` · `/admin/trainings/{id}/edit` | | |
| `/admin/training-types` | `TrainingTypeResource` | Training taxonomy (has a view page) |
| `/admin/device-types` | `DeviceTypeResource` | Airframe types + service intervals (has a view page) |
| `/admin/general-documents` | `OrganizationDocumentResource` | Document library |
| `/admin/maps` | `MapResource` | Geozone maps; edit page carries a KML-files sub-table |
| `/admin/mobile-sync-devices` | `MobileSyncDeviceResource` | Registered controllers. **No create route** (404) — records are created by device pairing |
| `/admin/mobile-log-uploads` | `MobileLogUploadResource` | Sync audit trail. Read-only |
| `/admin/unlinked-mobile-flights` | `UnlinkedMobileFlightResource` | Triage queue; rows link into `FlightResource` |
| `/admin/email-logs` | `EmailLogResource` | Outbound mail audit. Read-only |
| `/admin/microservices-page` | `MicroservicesPage` (custom page) | Not a resource; contents not catalogued |

Relation-manager tabs are addressed by query string on the parent edit page:
`?activeRelationManager={n}` (0-based, order as listed in doc 05).

`/admin` itself returned **500** — the panel path is `/admin/organizations`. Worth not
reproducing; make the panel root redirect properly.

## Operator report

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/organization-reports/{org}` | Session | Main operator screen (doc 06) |
| GET | `/organization-reports/{org}/data` | Session | JSON payload driving the screen |
| GET | `/organization-reports/{org}/print` | Session | Print/PDF view |
| POST | `/organization-reports/{org}/upload-logs` | Session | Flight import, all three modes (doc 07) |
| POST | `/organization-reports/{org}/upload-permit` | Session | Attach a flight permit |
| PATCH | `/organization-reports/{org}/flights/{flight}/assignment` | Session | Assign pilot + aircraft to a flight |
| POST | `/organization-reports/{org}/devices/{device}/maintenance` | Session | Record a maintenance entry |

`/data` query parameters: `period` (`this_month` \| `last_month` \| `custom`),
`pilot_id`, `device_id`, `date_from`, `date_to`. An unrecognised `period` falls through
to an HTML error rather than a JSON error; what the rebuild answers instead is decided in
[06-org-report.md](06-org-report.md) §"The data endpoint in the rebuild".

## Maps

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/map/{slug}` | **Public** | Full-page geozone map |
| GET | `/map/{slug}/embed` | **Public** | Iframe-embeddable variant |
| GET | `/map/{slug}/kml` | **Public** | Layer source. `?file={id}` or `?fallback={path}`, plus `&v={timestamp}` cache-buster |

These are the only routes that serve without a session. Anyone with the slug can read
every layer. That is probably intentional (the geozone data is public aeronautical
information) but it should be a conscious decision in the rebuild, not an accident.

## Other

| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/` | Session | Redirects to the user's organisation report |
| GET | `/dashboard` | Session | Thin landing page: greeting + link into admin |
| GET | `/login` | Public | Login form |
| POST | `/logout` | Session | Form POST with `_token` |
| GET | `/sanctum/csrf-cookie` | Public | `204`; token auth for the mobile client |
| POST | `/livewire/update` | Session | Framework internal |
| GET | `/demo/kml` | — | Linked from `/dashboard`; not catalogued |

The `/login` and `/logout` rows above come from the crawl's route table rather than from a
fetched page — the capture ran as an authenticated session and never visited a sign-in
form, so the paths and their auth are Observed and nothing about the form itself is. What
the rebuild does at `/login`, and why it has **no `/logout` path** (sign-out is a POST
server action), is decided in `09-roles-permissions.md` §"Sign-in and sign-out". The `/`
row is Observed as written, and the rebuild now redirects there too; which organisation's
report it resolves to, and where a session that is the primary contact of nothing lands
instead, are decided in that same section.

The rebuild adds three routes with no row above them, one per resource whose files it serves:
`/api/organizations/{id}/logo`, which serves what the predecessor served from
`/storage/organization-logos/{ULID}.png`, `/api/documents/{id}/file` for every bucket of
`document` — the global library and the three organisation registers alike — and
`/api/incidents/{id}/file` for the file an occurrence report carries, which is a column on its
own table rather than a fourth document bucket. Why a stored file is reached through a handler
rather than a static path, and why the buckets share one route rather than taking one each, are
decided in [03-data-model.md](03-data-model.md) §"Serving a stored file in the rebuild".

**Confirmed absent** (all 404): `/register`, `/forgot-password`, `/password/reset`.
There is no self-service registration or password reset — accounts are provisioned by an
admin. Decide deliberately whether the rebuild keeps that. For an aviation compliance tool
it is a defensible choice, but the absence of password reset means account recovery is
currently a manual support operation.

## Mobile API — not enumerated

Probing `/api/*` found no live endpoints, but the API certainly exists: Sanctum is
installed, and there are registered controller devices, a sync-log table and an
unlinked-flight queue that only a device client would populate. `/api/user` responded
with a redirect rather than a 404, suggesting the prefix is present but the routes sit
elsewhere.

Do not brute-force this against production. Recover it from the mobile app build, or from
`php artisan route:list` on the server.
