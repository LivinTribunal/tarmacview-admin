# 01 — Tech stack

## Fingerprint (observed)

| Layer | Technology | Evidence |
|---|---|---|
| Backend | **Laravel** (PHP) | `XSRF-TOKEN` cookie, `_token` CSRF fields, `/storage/...` symlink paths, ULID filenames, `App\Models\*` / `App\Filament\*` class names in serialised component state |
| Admin panel | **Filament v3.2.133** | `/js/filament/**?v=3.2.133.0`, `fi-*` CSS class namespace |
| Reactivity | **Livewire v3** | `/vendor/livewire/livewire.min.js`, `wire:snapshot` / `wire:effects` / `wire:id` attributes, `POST /livewire/update` |
| Client JS | **Alpine.js 3.14.3** | `window.Alpine.version`, `x-data` / `x-intersect` |
| CSS | **Tailwind** | Filament's compiled CSS; the operator report additionally loads `cdn.tailwindcss.com` |
| API auth | **Laravel Sanctum** | `GET /sanctum/csrf-cookie` → `204` |
| Maps | **Leaflet** + OpenStreetMap tiles | Leaflet attribution control, OSM tile copyright |
| Fonts/icons | Inter via `fonts.bunny.net`; Font Awesome 6 + AOS via CDN | `<link>` / `<script>` hosts |
| Locale | Slovak (`sk`) | `"locale":"sk"` in component memo; all UI copy |

## Two distinct front-ends

The application is not one uniform UI. It has two clearly separate surfaces built
differently, and the rebuild should preserve that split — they have different audiences.

**1. The admin panel** (`/admin/*`) — a Filament resource panel. Server-rendered
Livewire components, standard CRUD scaffolding, sortable/toggleable table columns,
modal-driven actions, bulk selection. Used by system operators and organisation admins.

**2. The operator report** (`/organization-reports/{token}`) — a hand-built Blade page
with vanilla JS and Tailwind from CDN. No Livewire. It fetches its own JSON, renders
tables and modals itself, and posts to purpose-built REST endpoints. This is the screen
end users actually live in, and it is deliberately simpler and more print-oriented than
the admin panel.

Everything else (`/map/*`, `/dashboard`) is plain Blade.

## The rebuild's own stack — decided

Everything above this line is **Observed** fact about the predecessor. Everything in this
section is a **decision about the rebuild**, taken by the owner on 15 Aug 2026, and it goes
deliberately against the recommendation this document used to carry.

| Layer | Choice |
|---|---|
| Framework | **Next.js**, App Router |
| Database | **Postgres** |
| Data layer | **Drizzle** |
| Tenant isolation | **Postgres row-level security** |
| Auth | **Better Auth** — admin-provisioned accounts, admin-initiated reset, no public signup |
| Hosting | **AWS**, app and database on one small instance, direct connections |
| Test runner | **Vitest** |

Row-level security was chosen because `CLAUDE.md` calls tenant scoping a security property
enforced globally rather than per-controller. RLS is the only option on the table where
forgetting a `WHERE` clause is impossible rather than merely reviewed against. It also
drives the hosting choice: RLS sets a per-session variable, which behaves unpredictably
under transaction-mode connection pooling, so direct connections were preferred over a
serverless database tier.

A NoSQL store was considered and rejected. It has no row-level security, so tenant
isolation would fall back to application code — the option explicitly rejected above — and
the workload is the wrong shape for it: the operator report filters on any combination of
period, pilot and device, and unassigned flights carry no value for the very attributes a
key-value store would index on.

Vitest carries the test layers because all five of them in `docs/rebuild/00-operating-model.md`
§5 are contract- and unit-shaped: they read `contracts/`, walk the route tree and exercise
domain rules, and none of them needs a browser. **Playwright is deliberately not chosen.**
`harness.config.json` tier 2 lists `playwright.config.*`, which anticipates a browser runner
without committing to one, and a pattern list is not a decision — if end-to-end coverage is
ever wanted, choosing the runner is a separate decision made here.

### What this costs, honestly

This document previously recommended keeping Laravel and Filament, on the grounds that the
admin panel is ~13 near-vanilla Filament resources and rebuilding them in Filament is
largely declarative. That reasoning was not wrong and the cost it warned about is real.

Moving off Filament means reimplementing, by hand: per-column sorting and visibility
toggles, deferred table loading, filter panels with reset, bulk selection with bulk
actions, modal action forms with their own validation, and relation-manager tabs. That is
the bulk of what the framework was providing, and it is a large amount of UI surface.

The decision accepts that cost in exchange for a stack the owner intends to maintain, a
tenancy model enforced by the database, and a front-end that is not inherited from the
system being replaced. Documents 04 and 05 still describe the admin surface accurately —
they simply no longer map onto a resource class one-for-one.

**The operator report should be rebuilt deliberately, not ported.** It is the product's
actual face and the most valuable screen to get right. It is currently plain JS against a
single JSON endpoint (`06-org-report.md`), which is a clean contract — you can rebuild
that screen in any framework without touching the admin panel.

**Two things worth fixing rather than reproducing:**

- Tailwind is loaded from `cdn.tailwindcss.com` on the operator report. That is the
  development build; it compiles CSS in the browser on every page load. Build it properly.
- Font Awesome and AOS are pulled from third-party CDNs. For a compliance tool that
  operators may run on restricted networks, self-host.

## Identifier conventions (observed)

- **Uploaded files** are stored under ULID-derived names (`01KZ6CPHTDETNYBD4P50BYR6BP.png`)
  in `storage/` subdirectories per type (`organization-logos/`, `map-kml/`, …). Original
  filenames are kept separately as a display column.
- **Most resources use integer primary keys** in URLs (`/admin/users/1/edit`,
  `/admin/flights/3658/edit`).
- **Organizations are the exception**: they expose a 32-character hex token as their route
  key (`/admin/organizations/{32-hex-token}/edit`) rather than their integer id — the
  underlying record was id `3` for the token observed. The *same* token is the operator
  report URL. See `06-org-report.md` for why that matters.
