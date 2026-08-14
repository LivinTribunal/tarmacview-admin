# 07 — Flight ingestion

Flights reach the system four ways. Three are user-initiated uploads through one endpoint;
the fourth is an automated push from ground controllers. Everything converges on the same
`Flight` + `FlightLog` records (doc 03).

```
DJI .txt log ─┐
Agro XLSX     ├─→ POST /organization-reports/{org}/upload-logs ─┐
Manual entry ─┘                                                 ├─→ Flight (+ FlightLog[])
                                                                │
Controller sync ─→ [mobile API] ─→ MobileLogUpload ─────────────┘
                                        │
                                        └─→ unassigned ─→ /admin/unlinked-mobile-flights
```

## The upload endpoint

```
POST /organization-reports/{org}/upload-logs
Content-Type: multipart/form-data
```

A single `upload_mode` discriminator selects which fields apply. Common to all modes:

| Field | Type | Notes |
|---|---|---|
| `_token` | hidden | CSRF |
| `upload_mode` | hidden | Set by the chosen tab |
| `pilot_id` | select | Optional; `Nie je priradený` = leave unassigned |
| `device_id` | select | Optional; `Nie je priradené` = leave unassigned. Options render as `serial — model` |

The pilot and aircraft selections are **defaults applied to everything in the import**, not
per-flight assignments. Anything left unassigned is correctable later from the flight row
(doc 06).

### Mode 1 — DJI text logs (`Nahrať .txt`)

| Field | Type | Notes |
|---|---|---|
| `files[]` | file, multiple | `accept=".txt"` |

The primary path. Multiple logs per submission; the UI shows a "Vybrané súbory:" list
before sending. Each file is parsed server-side into a flight plus its detail rows, with
`parsing_status` / `parsing_errors` recording the outcome. Parse failures are retained as
records rather than dropped — keep that, since a failed import still needs to be visible.

### Mode 2 — Agro export (`Import z agro exportu`)

| Field | Type | Notes |
|---|---|---|
| `agro_file` | file | `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) |

A spreadsheet export from agricultural spraying drones (the fleet includes Agras
airframes), which do not produce standard DJI logs. One workbook yields many flights.

**The expected column layout was not observable from the client** — it is parsed
server-side. Recover it from a sample export before building this path.

### Mode 3 — Manual entry (`Manuálne zadať let`)

For flights with no log at all.

| Field | Type | Notes |
|---|---|---|
| `manual_file_name` | text | Serves as the flight's display name |
| `manual_flight_start_time` | datetime-local | |
| `manual_flight_end_time` | datetime-local | |
| `manual_duration` | text | `h:mm` or decimal hours |
| `manual_max_altitude_meters` | number | |
| `manual_max_distance_meters` | number | |
| `manual_total_distance_meters` | number | |

Both an explicit duration *and* a start/end pair are collected. Decide which wins when
they disagree, and say so in the UI — the current form does not.

Note `manual_max_distance_meters` and `manual_total_distance_meters` are distinct: maximum
distance from the pilot (the VLOS-relevant figure) versus total track length.

## Admin-side import

`/admin/flights/create` offers the same thing through Filament: a `Spôsob vytvorenia`
radio, a `.txt` file field, optional default pilot and aircraft, and manual duration /
altitude / distance fields. Duration accepts `1:25` or `1,5` — note the **comma decimal
separator**, matching Slovak locale. Accept both separators.

## Controller sync

Ground controllers (e.g. DJI RC Plus) running the companion app push logs automatically.
The web app exposes the results but not the ingest route (doc 02 — API not enumerated).

**`MobileSyncDevice`** — one row per registered controller: identifier, name, model,
organisation, last user, last sync status and time, last seen, last remote address, app
version, blocked flag, blocked-attempt count.

Sync status vocabulary: `Prebieha` (in progress) · `Úspech` · `Čiastočný` (partial) ·
`Chyba` · `Blokované` · `Vo fronte` (queued) · `Duplicitné`.

**`MobileLogUpload`** — one row per file pushed: synced-at, filename, source path, stored
path, status, user, organisation, controller, device model, size, resulting `flight_id`,
error message. Status: `Uploaded` · `Duplicate` · `Parse failed` · `Upload failed`.

Two behaviours worth carrying over:

- **Duplicate detection.** Both enums have a dedicated duplicate state, so re-syncing the
  same log is expected and handled rather than treated as an error. Controllers re-upload;
  design for it.
- **Device blocking.** A controller can be blocked, and failed attempts are counted. This
  is the containment control for a lost or compromised device.

**`UnlinkedMobileFlight`** — a filtered view over flights that arrived with no pilot or
aircraft, surfaced as a dedicated admin queue with a sidebar count badge. Its row actions
link straight into the flight editor. Automated ingest cannot know who was flying, so this
queue is a permanent part of the workflow, not a defect. Keep the badge — it is what makes
the backlog visible.

## Derived flight attributes

- **`has_vlos_violation`** — set when a flight's maximum distance exceeds the aircraft's
  max VLOS. That value comes from the device type, so **an airframe with no device type
  assigned can never register a violation.** Live data contains such airframes. Surface
  the gap rather than reporting a silent pass.
- **Service cycles** — each recorded flight counts as one cycle toward the airframe's
  service interval (doc 03).

## Rebuild notes

- The DJI `.txt` parser is the highest-risk component here and is entirely server-side.
  Nothing about its format was observable. Budget for rebuilding it against real logs, and
  keep a corpus of samples as fixtures.
- Retain `parsing_status` / `parsing_errors` on the record. A flight that failed to parse
  is still evidence that a flight happened.
- Duration parsing must accept `h:mm`, decimal with a point, and decimal with a comma.
