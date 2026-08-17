# 06 — Operator report

`/organization-reports/{org}` — the screen operators actually use, and the product's real
face. It is the landing page after login (`/` redirects here) and the source of the
printable compliance summary.

Unlike the admin panel this is a hand-built page: server-rendered Blade shell, vanilla JS,
one JSON endpoint, and purpose-built REST actions. That makes it clean to rebuild in any
framework — the contract is small and explicit.

## Access

`{org}` is the organisation's 32-char hex token, the same value used as its admin route
key.

**The report requires a session.** Anonymous requests to the report, its data endpoint and
its print view all redirect to login (verified). Despite the page's own meta description
("Verejná správa organizácie" — public organisation report) and the permit toggle's
"visible on the public page" wording, nothing here serves anonymously.

Two things to decide deliberately rather than inherit:

1. **Is it meant to be public?** The copy says yes, the behaviour says no. Pick one. If a
   shareable read-only link is wanted, make it an explicit, revocable share token — not a
   side effect of the org's identifier.
2. **The token does double duty.** The same opaque string is the admin route key and the
   report URL. Anyone who sees one has the other. Separate them: an internal id for admin
   routes, and a distinct rotatable token for any shared report link.

## Layout

Top to bottom:

1. **Header** — logo, organisation name, UAS registration number, SPECIFIC permit number,
   generation timestamp, admin link (role-dependent), logout.
2. **Expiry warnings** — a list of people whose training or certificate falls inside the
   organisation's `licence_expiry_warning_days` window (default 40).
3. **Period selector** — `Tento mesiac` / `Minulý mesiac` / `Vlastné obdobie` (custom
   range), plus `Tlačiť PDF`.
4. **Summary tiles** — total flight time, flight count, active pilots.
5. **Pilots / UAS tabs** with a pilot filter.
6. **Flights table** for the selected period.
7. **Action panels** — flight-log upload, documents, maps.

## Data endpoint

```
GET /organization-reports/{org}/data
    ?period=this_month|last_month|custom
    &pilot_id=&device_id=&date_from=&date_to=
```

```jsonc
{
  "success": true,
  "data": {
    "period_dates": { "from": "01.08.2026", "to": "31.08.2026" },
    "total_flights": 0,
    "total_flight_minutes": 0,
    "total_flight_hours": 0,
    "active_pilots": 0,
    "pilots":  [ /* … */ ],
    "devices": [ /* … */ ],
    "flights": [ /* … */ ]
  }
}
```

**`pilots[]`** — `id`, `name`, `email`, `flights_count`, `total_minutes`, `total_hours`,
`avg_minutes`, `avg_hours`, `training_status`, `training_date`, `training_name`,
`licence_status`, `licence_date`, `licence_types[]`, `licence_number`, `trainings[]`,
`filtered_flights[]`, `flights_by_device[]`

**`devices[]`** — `id`, `name`, `serial_number`, `model`, `manufacturer`, `type`,
`status`, `max_vlos_meters`, `notes`, `total_flights`, `total_flight_hours`,
`lifetime_flights_count`, `last_flight_date`, `maintenance_instructions`,
`maintenance_logs[]`, plus the full derived service block (`service_due`,
`service_due_reasons[]`, `next_service_at_cycles`, `service_remaining_cycles`,
`service_overdue_cycles`, `next_service_date`, `service_remaining_days`,
`service_overdue_days`, `service_warning`, …) — see doc 03.

**`flights[]`** — `id`, `pilot_id`, `pilot_name`, `device_id`, `device_serial_number`,
`device_model`, `flight_hours`, `max_altitude`, `max_distance`, `flight_date`,
`flight_date_display`, `flight_date_sort`, `parsing_status`, `parsing_errors`,
`has_vlos_violation`

Note `pilot_id` / `device_id` are null while `pilot_name` / `device_serial_number` still
carry text — unassigned flights render a label plus an inline **Priradiť** (assign) button.

An unrecognised `period` returns an HTML error page instead of JSON. Return a JSON error.

### The data endpoint in the rebuild — decided

A **decision about the rebuild**, taken on 17 Aug 2026 by the rebuild loop under the owner's
standing autonomy grant and recorded on issue #87. The owner has not reviewed it: settled
enough to build on, open enough to overturn. Nothing here describes the predecessor except
where it says so; §Access and the endpoint above are what was Observed and they stay standing.

**The route keys on the organisation's `id`.** §Access asks for the token's double duty to be
broken, and the rebuild already broke it without recording that it had: `report_token` is its
own unique column with no reader anywhere in `src/`, and admin routes key on the serial id.
So the report does too, scoped by the session and by row-level security, and `report_token`
is reserved for the explicit revocable share link §Access asks for — which has no issue yet.
[03-data-model.md](03-data-model.md) §Organization carries the field.

**The `{org}` in the path is a selection and never a boundary.** The read runs inside
`withTenant` and there is no hand-written organisation filter guarding it: an id belonging to
an organisation the session is not a member of reads as absent, the same answer the
workspace already gives. A refusal would confirm the organisation is real.

**The blocks it does not serve are declared, not empty.** `data.pilots[]` and
`data.devices[]` are absent from the payload and named in a pending list the parity test
asserts against, so a block dropped by accident fails the suite instead of passing as "not
built yet". Serving them as empty arrays would say this operator has no pilots and no
airframes, which is a gap reading as a fact.

**An unrecognised `period` answers JSON, which is a deliberate behavioural departure** from
the HTML error page above. `custom` without a usable `date_from`/`date_to`, and a `pilot_id`
or `device_id` that is not an id, are the same class of error and get the same answer. An
*absent* period is not an error: it is `this_month`, the state the screen opens in before a
period is ever picked. Dates arrive on the query string as `YYYY-MM-DD`; `DD.MM.YYYY` is what
a reader sees and never what a query string carries.

**Periods and the three date variants resolve in UTC**, following the note in
`src/lib/i18n`: which zone a reader should see an instant in wants an organisation or a
browser to key off, and the report page is the first thing that will have either.
`period_dates` renders `DD.MM.YYYY`, and `total_flight_minutes` and `total_flight_hours` are
one quantity in two units, both derived from the recorded seconds rather than from each
other. `active_pilots` counts distinct pilots with a flight in the period, so an unassigned
flight contributes to none.

**Nullable columns the oracle types as non-null.** `flight_hours`, `max_altitude` and
`max_distance` serialise a null as `0` to hold parity — except that the VLOS judgement below
reads the *column*, so a flight that recorded no distance is never mistaken for one that
recorded zero. `parsing_errors` serialises a null as `""`, which is the one blank here that
is honest: no error recorded is exactly what an empty message means. `parsing_status` does
not, and gets a label naming the nothing-was-parsed case — a null status is the manual-entry
case, and reporting a parsed state or a blank would state an outcome that never happened
([03-data-model.md](03-data-model.md) §"Flights in the rebuild").

**So this null renders two ways, and the difference is recorded rather than left to a code
comment.** The flights register in [04-admin-resources.md](04-admin-resources.md)
§FlightResource renders the same null `parsing_status` as a **blank cell**, which is right
there: a table cell that is empty says nothing, and the column beside it carries the failure
where a parse failed. A contract key has no empty available to it — the oracle types this one
non-null on every captured row — so the absence has to be named instead of shown. Two
renderings of one value, for the reason each surface can carry.

**Where the flight's date comes from.** Derived, not stored — the derivation and what is
Inferred about it are in [03-data-model.md](03-data-model.md) §"Flights in the rebuild".

**`has_vlos_violation` is false in three different situations and only one is a pass:** the
distance was within the limit, the airframe has no VLOS limit to judge against, or no
distance was recorded to judge. The oracle gives this block no fourth key and parity forbids
inventing one, so the gap is surfaced where a key already exists for it —
`data.devices[].max_vlos_meters` is null and `service_warning` names the missing device type
— and never by overloading the boolean.

The consequence lands on the flights table below and is written here so it is not
rediscovered: **`has_vlos_violation: false` must not render as an affirmative all-clear.** A
flight that could not be judged is not a flight that passed.

## Tables

**Štatistiky pilotov** — `PILOT` (name + e-mail) · `POČET LETOV` · `CELKOVÝ ČAS` ·
`ŠKOLENIE` (status + expiry + training name) · `OSVEDČENIE` (status + expiry + licence
types). Status renders as `Platné`/`Platná` (valid), with amber inside the warning window.
A pilot row opens a **Detail pilota** modal.

**UAS tab** — per-airframe totals and service state; a row opens **Detail UAS** with the
maintenance history and the `Pridať záznam údržby` form.

**Lety za vybrané obdobie** — `STAV` · `DÁTUM` · `PILOT` · `UAS` · `ČAS LETU` ·
`MAX VÝŠKA (M)` · `VZDIALENOSŤ (M)`. `STAV` carries parsing status and the VLOS-violation
flag; `PILOT` and `UAS` fall back to `Priradiť` buttons when unset.

## Write actions

### Assign pilot / aircraft to a flight

```
PATCH /organization-reports/{org}/flights/{flight}/assignment
```
Sent from the inline `Priradiť` → `Uložiť priradenie` flow. Payload carries `pilot_id`
and `device_id` (either may be null). *Not executed — shape read from client code.*

This is the correction path for the common case of a log arriving without attribution.
It is a genuinely important workflow, not an edge case: keep it one click from the flight
row.

### Record maintenance

```
POST /organization-reports/{org}/devices/{device}/maintenance
```

| Field | Type | Required |
|---|---|---|
| `maintenance_date` | date | yes |
| `total_flight_hours` | text (`h:mm` or decimal) | yes |
| `total_flights` | number | |
| `maintenance_performed_by` | text | |
| `fault_and_maintenance_description` | textarea | |
| `preflight_check_performed_by` | text | |

Logging maintenance is what resets the service-interval baseline (doc 03).

### Upload flight logs

```
POST /organization-reports/{org}/upload-logs
```
Three modes behind one endpoint — see doc 07.

### Upload a flight permit

```
POST /organization-reports/{org}/upload-permit
```
`_token`, `permit_file` (required; `.pdf,.jpg,.jpeg,.png,.doc,.docx`).

### Print / PDF

```
GET /organization-reports/{org}/print?period=&pilot_id=&device_id=&date_from=&date_to=
```
A plain GET form carrying the current filter state, so the printed document matches
exactly what is on screen. Worth preserving — this output is the point of the tool.

## Documents panel

`Dokumenty, formuláre a letové povolenia` expands into four counted groups:
`Dokumenty (n)` · `Formuláre (n)` · `Letové Povolenia (n)` · `Incidenty (n)`, each listing
downloadable files, plus a `Nahrať letové povolenie` action.

This is the read side of the org workspace registers (doc 05) — operators consume here
what admins curate there.

## Maps panel

Each map assigned to the organisation renders as a collapsible Leaflet iframe
(`/map/{slug}/embed`) with an `Otvoriť plnú mapu` link. See doc 08.
