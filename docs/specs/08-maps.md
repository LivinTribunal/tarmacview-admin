# 08 — Geozone maps

A map is a named, slugged collection of KML/KMZ layers rendered on Leaflet over
OpenStreetMap tiles. Maps are assigned to organisations and embedded in the operator
report; they are also the only part of the system that serves anonymously.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `/map/{slug}` | **Public** | Full-page map |
| `/map/{slug}/embed` | **Public** | Iframe variant used by the report |
| `/map/{slug}/kml?file={id}&v={ts}` | **Public** | One layer's KML |
| `/map/{slug}/kml?fallback={path}&v={ts}` | **Public** | Layer by stored path |

`v` is a cache-buster carrying the file's update timestamp.

**All map routes serve without a session** (verified). Anyone with the slug reads every
layer. This is plausibly intentional — geozone data is public aeronautical information —
but it should be a deliberate decision in the rebuild, and slugs are guessable
(`uas-oblasti`). If any map is ever tenant-specific, this is a leak.

Note also that the organisation assignment on a map controls **which tenants see it in
their report**, not who can reach the URL. Do not mistake it for an access control.

## Viewer

Rendered client-side with Leaflet:

- Layer legend grouped by layer type, with per-group and global show/hide
  ("Skryť všetky"), and a `shown / total` counter per group
- Search and filter controls
- Zoom controls, scale bar, OSM attribution
- Progressive layer loading with a live "Načítané *n* z *m*" indicator
- Optional dark basemap toggle, when the map enables it

Layer counts are substantial — 63 and 164 files on the two observed maps — so
**progressive loading is a functional requirement, not a nicety.** Preserve the visible
progress indicator; users need to know the picture is incomplete.

Clicking a point resolves which geozones contain it. Two layer flags shape that:
`is_not_geozone` (layer shown as supplementary information rather than a containing zone)
and `default_when_no_geozone` (shown only when the point falls in no geozone at all) —
i.e. the "you are in unrestricted airspace" case.

## Map record

`/admin/maps` — columns `ID^` · `Názov^` · `Slug^` · `Tmavá mapa` · `Na mape` (file count).
Row actions `Otvoriť mapu` · `Duplikovať` · `Upraviť`.

**Form** — *Základné informácie*: `Názov` (required), `Slug` (required; used in the URL),
`Povoliť prepínanie tmavej mapy` (toggle). *Organizácie*: searchable multi-select.

`Duplikovať` clones a map with its layers — observed as `uas-oblasti-copy-cyfzo9`,
evidently used to stage changes against a copy before touching the live map. Worth keeping
as an explicit feature, ideally with a clearer "draft / published" model than a copy with
a random suffix.

## KML layers

Relation manager on the map editor.

**Columns:** `Priorita` · `Typ vrstvy` · `Názov` · `Súbor` · `Nahrané` · `Aktívny` ·
`Nie je geozóna` · `Default bez geozóny`
**Row actions:** `Link na KML` · `Skryť z mapy` (toggle active) · `Upraviť` ·
`Upraviť názvy a popisy` · `Náhľad` · `Odstrániť`
**Bulk:** `Odstrániť vybrané`

**Header action — `Pridať KML / KMZ`:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Názov v legende | text | ≤255 | Legend label |
| Predvolený názov placemarku | text | ≤255 | Fallback placemark title |
| Predvolený popis placemarku | textarea | | Fallback placemark description |
| Nie je geozóna | toggle | | *"Shown separately as additional information when clicked"* |
| Predvolená pri žiadnej geozóne | toggle | | *"Shown only when the clicked point is in no geozone"* |
| Priorita | number ≥0 | | *"Higher value = layer drawn on top"* |
| Typ vrstvy | select | | See below |
| KML / KMZ súbor | file | **required**; `.kml`, `.kmz`, `.xml`, ≤10 MB | KMZ auto-extracted |

### Layer types

Each type carries a fixed legend colour:

| Type | Colour | Meaning |
|---|---|---|
| *(none)* | grey | Untyped |
| `NO FLY + 3,7 km` | red | Prohibited zone plus 3.7 km buffer |
| `5 km okruh` | light orange | 5 km aerodrome ring |
| `LZR` | ochre | Restricted area |
| `CTR` | light blue | Control zone |
| `ATZ` | yellow | Aerodrome traffic zone |
| `CHKO` | green | Protected landscape area |

The colour is bound to the type, not chosen per layer — so the legend stays consistent
across maps. Keep that binding; let branding restyle the palette centrally rather than
per-file.

The separate `Upraviť názvy a popisy` action edits placemark titles and descriptions
inside an uploaded file, so imported KML can be corrected without re-uploading.

## Rebuild notes

- Layers are served through the app (`/map/{slug}/kml`), not straight from storage, so
  access, the `fallback` path form and cache-busting all stay under application control.
  Keep the indirection.
- Priority ordering plus per-type colouring plus the two geozone flags together define the
  click-resolution behaviour. That logic is the substance of the feature — reproduce it
  before worrying about the map's appearance.
- KMZ is unzipped on upload; store the extracted KML.
- With 60–160 layers per map, plan the loading strategy up front.
