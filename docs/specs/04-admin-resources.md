# 04 — Admin resources

Thirteen resources plus one custom page. All share the same table chrome, described once
below, then each resource lists only what differs.

Column names are the UI labels; `^` marks sortable; *(toggle)* marks a column hidden by
default and enabled via the column-visibility menu. Toggleable column keys are given
where observed, since they reveal the underlying field names.

## Shared table behaviour

Every index table provides:

- **Search** — a single free-text box (per-column search is wired but not enabled)
- **Column visibility** — "Prepnúť stĺpce" toggle menu; state persists per user
- **Sorting** — per-column, on the columns marked `^`
- **Pagination** — page-size selector `5 / 10 / 25 / 50 / All`, default `10`
- **Bulk selection** — select-all and per-row checkboxes, where bulk actions exist
- **Filters** — a dropdown panel with a reset control, on the resources that define them

Deletes are confirmed through a modal. Row actions render as a trailing actions column.

### Header actions in the rebuild — decided

A **decision about the rebuild**, taken on 22 Aug 2026 by the rebuild loop under the owner's
standing autonomy grant and recorded on issue #50. The owner has not reviewed it: settled
enough to build on, open enough to overturn. Nothing here describes the predecessor; the
header lines the resource sections carry are what was Observed and they stay standing.

The shared chrome renders the header action too, above the table, under one label rather
than each resource's own wording — the same decision the trailing actions column already
carries. Whether a register offers one is per register, and it is gated on the write
authority the database will admit, so a session that could not complete the form is not
offered it. One label is what overrides `Pridať mapu`, which §MapResource records as
Observed; the rebuild's maps register has rendered `Vytvoriť` since #68 built it, so this
decision writes that divergence down rather than introducing it.

Only three of the thirteen resource sections name a header action — `Vytvoriť` on
`OrganizationResource` and `UserResource`, `Pridať mapu` on `MapResource` — and three more
record its absence explicitly. Elsewhere the silence is a gap in the capture rather than an
Observed absence, so it is not evidence either way; [contracts/routes.json](../../contracts/routes.json)
is what carries the route, holding `/admin/<resource>/create` behind a session for every
built register and for none of the mobile-sync or append-only surfaces.

---

## OrganizationResource — `/admin/organizations`

The tenant register and the entry point to the org workspace (doc 05).

**Columns:** `ID^` · `Logo` · `Názov^` · `UAS registrácia^` · `Používatelia^` (count) ·
`UAS^` (count)
*(toggle)* `specific_permit_number` · `specific_operation_type` · `max_allowed_altitude` ·
`insurance_valid_until` · `created_at` · `updated_at`

**Row actions:** `Home Page` → the operator report · `Správa organizácie` → the org editor
**Header:** `Vytvoriť` · **Bulk:** `Vymazať vybrané`

**Form** (create and edit are identical):

| Field | Control | Rules | Helper |
|---|---|---|---|
| Názov organizácie | text | required, ≤255 | Official organisation name |
| Logo organizácie | file | PNG/JPG/WebP ≤2 MB | |
| Číslo zápisu do registra | text | ≤255 | Operator registration number |
| Číslo prevádzkového povolenia SPECIFIC | text | ≤255 | |
| Druh prevádzky SPECIFIC | select | `VLOS` \| `BVLOS` | VLOS = within sight, BVLOS = beyond |
| Maximálna povolená výška | number | metres | |
| Poistenie platné do | date | | Insurance validity |
| Upozornenia o expirácii — dní pred | number | required, 1–730, default 40 | Amber warning threshold on the report |

Deleting an organisation is offered as a bulk action — a hard cascade here destroys
airworthiness evidence. Which way the rebuild goes is settled in
[03-data-model.md](03-data-model.md) §"Organisation deletion and the logo in the rebuild".

The `Logo` column renders the file rather than the stored path, through a route that reads
the organisation row first. That, and the PNG/JPG/WebP row above serving as the allow-list
the content type is decided from, are settled in [03-data-model.md](03-data-model.md)
§"Serving a stored file in the rebuild".

---

## UserResource — `/admin/users`

**Columns:** `ID^` · `Meno` · `Email` · `Číslo Osvedčenia` · `Organizácia^` · `Roly^`
**Row actions:** `Upraviť` · **Header:** `Vytvoriť` · **Bulk:** none

**Form** — two sections:

*Základné informácie*

| Field | Control | Rules | Helper |
|---|---|---|---|
| Meno a priezvisko | text | required, ≤255 | |
| Email | email | ≤255, **optional** | May be blank for pilots; displays as "—" |
| Organizácia | select | | |
| Heslo | password | ≥8 | Blank on edit = unchanged |
| Potvrdenie hesla | password | must match | |
| Roly | multi-select | required | See doc 09 §"The people register's `Roly` in the rebuild" — the column carries the same axis |

*Osvedčenia*

| Field | Control | Helper |
|---|---|---|
| Číslo Osvedčenia | text | Pilot certificate number |
| Typy osvedčení | multi-select | A1/A3, A2, STS — multiple allowed |
| Platnosť do | date | Certificate expiry |

**Relation manager:** *Školenia* (trainings) — see doc 05.

The rebuild names this section's fields *certificate*, not *licence*, and keeps the
predecessor's field names only where the form contract captured them — see
[03-data-model.md](03-data-model.md) §"Certificates in the rebuild".

---

## FlightResource — `/admin/flights`

**Columns:** `ID^` · `Názov súboru` · `Predvolený pilot` · `Predvolené zariadenie (S/N)` ·
`Záznamy logov^` (count) · `Stav` · `Čas letu^` · `Max. výška (m)^` ·
`Celková vzdialenosť (m)^` · `Importoval` · `Importované^`
*(toggle)* `importedBy.name` · `created_at`

**Filters:** `Pilot` (select) · `Zariadenie` (select, by serial)
**Row actions:** `Upraviť` · **Bulk:** `Odstrániť vybrané`

**Form** — driven by a `Spôsob vytvorenia` (entry mode) radio that switches the rest of
the form. See doc 07 for the full import semantics.

| Field | Control | Notes |
|---|---|---|
| Spôsob vytvorenia | radio | Selects import path |
| Súbor letového logu | file | required in upload mode; DJI `.txt` |
| Predvolený pilot | select | optional; applied to every flight in the import |
| Predvolené zariadenie | select | optional; likewise |
| Čas letu | text | `h:mm` (e.g. `1:25`) or decimal hours (`1,5`) → stored as seconds |
| Max. výška (m) | number | |
| Celková vzdialenosť (m) | number | |

**Relation manager:** *Detaily letov* (flight logs) — read-only table:
`Začiatok letu` · `Koniec letu` · `Trvanie` · `Vzdialenosť` · `Max. výška` · `Aircraft`.

The rebuild refuses a flight that names another operator's airframe in the schema rather
than in a policy, keeps an unassigned flight and a failed parse in the register, and adds a
`Max. vzdialenosť (m)` field the capture never saw because the VLOS check is judged on it —
see [03-data-model.md](03-data-model.md) §"Flights in the rebuild".

---

## TrainingResource — `/admin/trainings`

**Columns:** `ID^` · `Názov^` · `Typ^` · `Pilot^` · `Zariadenia` · `Dátum školenia^` ·
`Platnosť do^` *(toggle)* `devices_display` · `created_at` · `updated_at`
**Row actions:** `Upraviť` · `Odstrániť` · **Bulk:** `Odstrániť vybrané`

**Form:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Názov školenia | text | required, ≤255 | |
| Typ školenia | select | | Initial, recurrent, etc. |
| Pilot | select | required | |
| UAS / zariadenia | multi-select | | One or more airframes |
| Dátum školenia | date | | When it took place |
| Platnosť do | date | optional | Blank = never expires |

The rebuild names the last two `held_on` and `valid_until`, keeps the contract's
`date_start` and `date_end` as the form's wire names, and refuses a training that points at
another operator's syllabus entry or airframe in the schema rather than in a policy — see
[03-data-model.md](03-data-model.md) §"Trainings in the rebuild".

---

## TrainingTypeResource — `/admin/training-types`

**Columns:** `ID^` · `Názov^` · `Kód^` · `Popis` · `Školenia^` (usage count)
**Row actions:** `Zobraziť` · `Upraviť` · `Odstrániť` · **Bulk:** `Odstrániť vybrané`

**Form:** `Názov` (required, ≤255) · `Kód` (required, unique) · `Popis` (textarea)

---

## DeviceTypeResource — `/admin/device-types`

The airframe catalogue that drives service scheduling.

**Columns:** `ID^` · `Name^` · `Max VLOS (m)^` · `Servis podľa cyklov^` ·
`Kalendárny servis^` · `Servis batérie^` · `Zariadenia^` (count)
**Row actions:** `Zobraziť` · `Upraviť` · `Odstrániť` · **Bulk:** `Odstrániť vybrané`

**Form:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Názov typu zariadenia | text | required, ≤255 | |
| Max VLOS (m) | number, step 0.01 | | Max visual-line-of-sight distance |
| Servis podľa cyklov | number, ≥0, step 1 | | Cycles to service; **one recorded flight = one cycle** |
| Kalendárny servis | number, ≥1, step 1 | | Months since last maintenance, or since first recorded flight |
| Servisný interval batérie | number, ≥0, step 1 | | Battery cycles |
| Pokyny pre údržbu | textarea | ≤65535 | Shown to the technician |

Helper text states explicitly: when both cycle and calendar intervals are set, the warning
fires at **whichever limit is reached first**.

---

## OrganizationDocumentResource — `/admin/general-documents`

The global document library (organisation-scoped documents live in the org workspace).

**Columns:** `Názov^` · `Súbor` · `Odkaz` · `Veľkosť^` · `Kategória` · `Platnosť do^` ·
`Nahral^` *(toggle)* `created_at`
**Row actions:** `Upraviť` · `Odstrániť` · **Bulk:** `Odstrániť vybrané`

**Form:** `Názov dokumentu` (required, ≤255) · `Súbor` (required, file) ·
`Poznámka` (textarea)

The list exposes `Kategória` and `Platnosť do` columns that the create form does not
collect — so either they are set elsewhere, or the form is incomplete relative to the
model. Worth resolving during the rebuild.

`Odkaz` is read as the link that fetches the file, *(inferred)*: it sits beside `Súbor` and
doc 03 §Document carries no url column, so the two are the stored name and the way to reach
it. An external-url column the crawl never saw is not ruled out, and a captured record whose
two cells differ would settle it.

The rebuild resolves half of the `Kategória` / `Platnosť do` gap above — `category` is the
bucket, which is why no captured form collects one — leaves `Platnosť do` a gap and renders
it as one, and reaches the file through a route taking the row id rather than a stored
path — see
[03-data-model.md](03-data-model.md) §"The global document library in the rebuild" and
§"Serving a stored file in the rebuild".

---

## MapResource — `/admin/maps`

**Columns:** `ID^` · `Názov^` · `Slug^` · `Tmavá mapa` · `Na mape` (KML file count)
*(toggle)* `created_at`
**Row actions:** `Otvoriť mapu` · `Duplikovať` · `Upraviť` · **Header:** `Pridať mapu`

**Form** — two sections: *Základné informácie* (`Názov` required; `Slug` required, used in
`/map/{slug}`; `Povoliť prepínanie tmavej mapy` toggle) and *Organizácie* (searchable
multi-select controlling which tenants see the map).

`Duplikovať` — see doc 08.

**Relation manager:** *KML súbory* — see doc 08.

---

## MobileSyncDeviceResource — `/admin/mobile-sync-devices`

Registered ground controllers. **Read-mostly: there is no create route** (`/create` → 404);
records appear through device pairing. Sidebar shows a live count badge.

**Columns:** `Identifikátor^` · `Názov zariadenia^` · `Model^` · `Organizácia^` ·
`Posledný používateľ^` · `Stav syncu^` · `Posledný sync^` · `Blokované` ·
`Blok. pokusy^` *(toggle)* `device_name` · `last_seen_at` · `last_remote_addr` ·
`app_version`

**Filters:** `Blokované` (Áno/Nie) · `Organization` · `Last sync status`
**Row actions:** `Detail` · `Blokovať`

Blocking a controller is the security lever for a lost or compromised device. Preserve it,
along with `blocked_attempts` — that counter is how you notice a device still trying.

---

## MobileLogUploadResource — `/admin/mobile-log-uploads`

Append-only sync audit trail. No create, no row actions.

**Columns:** `Čas syncu^` · `Súbor^` · `Stav^` · `Používateľ^` · `Organizácia^` ·
`Ovládač^` · `Model^` · `Veľkosť^` · `Flight ID^` · `Chyba`
*(toggle)* `organization.name` · `device_model` · `source_path` · `stored_path`

**Filters:** `Status` (`Uploaded` \| `Duplicate` \| `Parse failed` \| `Upload failed`) ·
`Organization`

---

## UnlinkedMobileFlightResource — `/admin/unlinked-mobile-flights`

Triage queue for synced flights with no pilot or aircraft assigned. Sidebar count badge.

**Columns:** `Importované^` · `Súbor` · `Organizácia^` · `Importoval^` · `Záznamy^` ·
`Čas letu^` · `Začiatok letu` *(toggle)* `file_path`
**Row actions:** `Zobraziť let` · `Upraviť let` — both route into `FlightResource`
(`/admin/flights/{id}/edit`), so this is a filtered view over flights, not its own entity.

---

## EmailLogResource — `/admin/email-logs`

Append-only outbound mail audit. No create, no row actions.

**Columns:** `Odoslané^` · `Príjemca` · `Organizácia^` · `Predmet` · `Typ` · `Stav^`
*(toggle)* `mailer` · `message_id` · `error_message` · `created_at`

**Filters:** `Stav` (`Odoslané` \| `Zlyhalo` \| `Odosiela sa`) ·
`Typ` (`Mesačný prehľad` \| `Systémový e-mail`)

---

## MicroservicesPage — `/admin/microservices-page`

A custom page under a "System" sidebar group, not a resource. Renders no table or form in
its initial markup. Contents not catalogued — inspect the running system or ask whoever
operated it before rebuilding.
