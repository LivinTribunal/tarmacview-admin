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

## Consequences for the rebuild

**Keeping Laravel + Filament is the cheapest path.** The admin panel is ~13 near-vanilla
Filament resources. Rebuilding those in Filament is largely declarative: a resource class
per entity, a form schema, a table schema, and relation managers. Documents 04 and 05 are
written to map onto that structure directly. If you keep the stack, the admin panel is
mostly transcription, not design work.

**If you move off Filament**, budget realistically. The admin panel is not just CRUD
forms — you would be reimplementing per-column sorting and visibility toggles, deferred
table loading, filter panels with reset, bulk selection with bulk actions, modal action
forms with their own validation, and relation-manager tabs. That is the bulk of the
framework's value, and it is a lot of UI surface to rewrite by hand.

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
