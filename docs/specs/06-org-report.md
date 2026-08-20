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

### The report page in the rebuild — decided

A **decision about the rebuild**, taken on 17 Aug 2026 by the rebuild loop under the owner's
standing autonomy grant and recorded on issue #97, and extended on 20 Aug 2026 on issue #101.
The owner has not reviewed it: settled enough to build on, open enough to overturn. Items 1–7
above are what was Observed and stay standing; only the page's own choices are below. Items 6–7
are not built — the flights table and the pilot filter that narrows it are their own slice, and
the print view and the panels are another.

**The page and the data endpoint share one payload builder, in one transaction.** The page
makes the same four scoped reads the endpoint makes, hands them to the same builder, and
renders keys off the result. It derives no figure of its own: two derivations of one number
drift, and the payload's is the one with tests. A server component fetching its own HTTP
endpoint would double the work, lose the session, and make one screen two reads that can
disagree.

**The header's identity comes off the `Organization` row, not off the payload.** The
envelope carries no organisation block, so the name, the UAS registration number, the
SPECIFIC permit number and the logo are read from the row the transaction already holds for
`licence_expiry_warning_days` — reported rather than computed around, and no key is added to
the payload to carry them. The logo is served through the route that takes an organisation
id and nothing else ([03-data-model.md](03-data-model.md) §"Serving a stored file in the
rebuild"); an absent `logo_path` renders no image rather than a broken one. Both regulatory
numbers are nullable and each absence gets a **named label**: on a regulator-facing pack a
blank beside a label reads as *none required*, which is a gap reading as a fact.

**The generation stamp renders as a date and the clock time is dropped.** Item 1 says
*timestamp*; `src/lib/i18n` prints one format and no time, and picking one and holding it is
the rule. If a printed pack needs the time of day, that is the print slice's to add.

**The expiry-warnings block lists three statuses and stays silent on two.** `expiring`,
`expired` and **`none`** each list under their own label; `valid` and `noExpiry` produce no
row, per the affirmative-only rule [05-organization-workspace.md](05-organization-workspace.md)
owns. That split is §"`data.pilots[]` in the rebuild" applied to a screen: a pilot with no
certificate recorded is a **gap** and one whose certificate never expires is a **stated
fact**, and one label over both would let the gap read as the fact. A pilot with nothing to
surface has no row, and where nobody has anything the block is **absent** rather than
printing an all-clear — the same rule `has_vlos_violation: false` is held to above.

Selection compares each status against `t()` of its **own** key family. The payload carries
these two as already-rendered strings and the oracle gives the block no status-code key, so
there is nothing else to compare against; `training_status` and `licence_status` render
identical Slovak for four of their five states today, and a crossed comparison would pass now
and break the moment a translator separates them.

**The period selector is a plain GET form** carrying `period`, `date_from` and `date_to` —
the wire vocabulary §"The data endpoint in the rebuild" already fixes, with dates as
`YYYY-MM-DD` and never the `DD.MM.YYYY` a reader sees. An unusable range renders the
endpoint's own query error **beside the header and the selector**, so the reader can correct
it, rather than a report reading zero: zero would say nothing was flown when what happened is
that two dates arrived the wrong way round. The warnings block above is **not** part of the
body that error replaces: it takes no period, so it survives one — an absent block already
means *nobody has anything pending*, and a mistyped range must not withdraw a warning.
`Tlačiť PDF`, which item 3 puts beside the selector, is the print slice's.

**The admin link is gated deny-by-default and superadmin-only.**
[09-roles-permissions.md](09-roles-permissions.md) records that the predecessor rendered an
`Administrácia` link and that whether it was role-gated was never tested, so there is no
behaviour to reproduce — and the rebuild cannot resolve an acting session's membership role
yet. The narrowest answer stands until the real matrix is recovered.

**The two tabs are addressed `?tab=pilots|uas`, and the detail a row opens is `?detail={id}`.**
Both names are the rebuild's: `contracts/routes.json` carries only the path, so there was nothing
observed to reproduce, and a named tab value is the legible form of the workspace's indexed
`?activeRelationManager={n}`. An absent `tab` is the pilots tab, the way an absent `period` is
`this_month`; an unrecognised one reads as **absent** rather than falling back, because a link to
a tab nobody built answering 200 is the reading that survives longest before anyone notices. That
deliberately differs from an unrecognised `period`, which renders its error beside the selector: a
period is a filter over content and a tab is the address of a section. One `detail` parameter
serves both tabs, because the active tab already says which register it indexes — and it is not
spelled `pilot_id` or `device_id`, which are the endpoint's **filter** vocabulary above and would
narrow the payload instead of opening a row. A tab link carries `period`, `date_from` and
`date_to` forward and drops `detail`; the period form carries the active `tab` as a hidden input.
Without both, switching tabs silently resets the window a reader typed and resubmitting a period
throws them back to the first tab.

**A detail view is a server-rendered disclosure the URL names, and not a modal.** §Tables records
the predecessor's `Detail pilota` and `Detail UAS` as modals — Observed, and that finding stands
as it reads; the rebuild departs from it. An address is linkable, it survives the print view item
3 puts beside the selector, it needs no client component, and it cannot disagree with the payload
the page already holds. Neither detail issues a read: `trainings[]`, `filtered_flights[]`,
`flights_by_device[]` and `maintenance_logs[]` are all already in that payload, and the page makes
the same reads with a detail open as with none. The `{id}` is resolved against the rows in hand, so
one naming none of them opens no detail — which makes the scoping structural rather than a
discipline, because another operator's id was never in the payload to be found.

**Both registers render the shared index table and declare no row action.** Visibility, search,
sorting and pagination are behaviours [04-admin-resources.md](04-admin-resources.md) §"Shared table
behaviour" already owns, and a component that takes rows and never queries is exactly what a
payload-fed table needs. Neither declares an edit route: a detail is a disclosure rather than a
route, and the row link on the identity column is what opens it. No column declares itself
sortable — §Tables captured no sort marker on either table, and inventing one is a behaviour
nobody observed.

**Two of the labels are the rebuild's own, marked here so they do not come to read as Observed.**
`Štatistiky pilotov` is Observed; the **UAS tab's own Slovak label was never captured** — §Tables
records it as *UAS tab* and nothing more — so the rebuild names it `UAS`. Its column set is the
rebuild's reading of *per-airframe totals and service state*, which is all §Tables records of that
table. The five pilot headings are Observed and render in sentence case: the capture's all-caps is
appearance, and the clean-room line takes the wording and not the styling, exactly as it takes the
state and not the amber a status inside the warning window was drawn in.

**The UAS table's service cell reads `service_warning` and never `service_due`.** Three states
render as three: the gap names itself, a due service names itself, and one that is not due renders
the blank marker under the affirmative-only rule. An airframe with no device type has no VLOS limit
and no service interval, so `service_due: false` beside it is *not knowable* rather than an
all-clear — the same shape `has_vlos_violation: false` is held to above. In `Detail UAS` the
maintenance readings render as the technician stated them: the hours are text in either notation,
and a null `total_flights` names the absence rather than printing `0`, which would be a reading
nobody took.

**Both tables sit inside the report body that the query error replaces.** The pilots table's two
count columns are the period's own figures and the UAS table has none without a payload, so an
unusable range renders the error here too rather than a register of zeroes stating that nothing
was flown. The warnings block above them stays outside that body, for the reason the selector
paragraph gives.

**`/` still forwards to the admin panel**, not here. The report is a landing page worth
having only once its tables exist; [09-roles-permissions.md](09-roles-permissions.md)
§"Sign-in and sign-out" keeps recording the interim destination until the slice that builds
them moves it.

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

**The pending list is empty, and that is now the strongest claim the parity suite can make.**
A block the endpoint could not serve was declared in a list rather than sent as an empty
array, because `[]` would say this operator has no pilots — a gap reading as a fact.
`data.devices[]` left the list on 17 Aug 2026 (issue #90) and `data.pilots[]` emptied it the
same day (issue #92), so the assertion is no longer "the unserved paths are exactly the
declared ones" but **every oracle path under `data.` is served**. The list and the mechanism
stay, for the block that cannot be served next; the non-vacuity guard stays with them, or the
claim would pass over a payload with no rows in it.

**`data.devices[]` carries two flight aggregates and they are different quantities.**
`total_flights`, `total_flight_hours` and `last_flight_date` are **period-filtered** and are
grouped from the same rows `data.flights[]` is serialised from, so the two blocks cannot
disagree about which flights fall in the window a reader selected. `lifetime_flights_count`
and `service_lifetime_cycles` are **all-time**: one cycle is one recorded flight for the life
of the airframe, and a service interval measured over a one-month window would reset every
month. Every airframe of the operator lists, whether or not it flew in the period; a flight
naming no airframe belongs to no row here and still lists in `data.flights[]`. The service
block beside them is composed from stated readings only —
[03-data-model.md](03-data-model.md) §"Maintenance log in the rebuild".

**`maintenance_logs[]` has no oracle below it, and that ceiling is stated rather than
papered over.** The captured payloads carry no key path under the array — every captured one
was empty (Observed) — so its member shape is the rebuild's own, mirroring
[03-data-model.md](03-data-model.md) §MaintenanceLog's columns rather than guessing at
oracle-shaped names. Parity claims only that the key exists and is an array, and the parity
suite excludes that one subtree by name from its no-invented-keys assertion instead of
filtering it quietly. It is served rather than held empty for the reason the pending list
exists: an airframe that has been serviced reporting `[]` would be a gap reading as a fact.

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

### `data.pilots[]` in the rebuild — decided

The same **decision about the rebuild**, extended on 17 Aug 2026 by the rebuild loop under
the owner's standing autonomy grant and recorded on issue #92. The owner has not reviewed it.
Everything below is a rebuild decision, not a predecessor finding; the two occurrence counts
it cites are Inferred from the captured payloads and are marked where they appear.

**The payload spells four keys `licence_*`; nothing else in the rebuild does.** The captured
payload carries `licence_number`, `licence_types[]`, `licence_date` and `licence_status`,
while the rebuild's columns are `certificate_number`, `certificate_types` and
`certificate_valid_until`. [03-data-model.md](03-data-model.md) §"Certificates in the
rebuild" settles the rule and the reason a captured spelling stays — these four keys are the
same case as the form contract's three — so **every identifier, type, comment, test name and
sentence around them says certificate**. The `OSVEDČENIE` column in §Tables below is the
rendering of these keys and takes the domain word, not the wire one. The one place the
synonym survives in the rebuild is `organization.licence_expiry_warning_days`, which mirrors
the predecessor's own column ([03-data-model.md](03-data-model.md) §Organization).

**Every pilot the organisation rosters lists, whether or not they flew.** The rule
`data.devices[]` already follows: one who flew nothing reports zero counts and zero averages,
because dropping them would hide a pilot from the roster the report is evidence about.
`active_pilots` in the envelope is a **different number** and the two legitimately disagree —
the periods paragraph above defines it, and a flight flown by an accountable manager counts
there and has no row here. Both are right; neither is the other's bug.

**Three more nullable columns the oracle types non-null**, the class the `flight_hours`
paragraph above already covers. `email` gets a label naming the absence — never `""`, never
anything shaped like an address — because a pilot may exist with no e-mail and no credentials
and nothing in this block may make the column required. `trainings[].training_type` and
`trainings[].date_start` get labels for the same reason: `training_type_id` and `held_on` are
both nullable, and an unclassified training or one whose date was never recorded is a gap that
must not render blank.

**No expiry is a stated fact, and it is neither a warning nor a lapse.** A null
`certificate_valid_until` or `training.valid_until` means the record never expires —
[03-data-model.md](03-data-model.md) §Training records `empty = "Bez expirácie"` (Observed) —
so it gets its own status, distinct from valid-with-a-date and from expired. Holding **no**
certificate and holding **no** training get their own statuses again: an absent record is a
gap and a never-expiring one is a fact, and one label for both would let the gap read as the
fact.

**The warning window is the organisation's own.** A status is computed against the injected
`asOf` and `organization.licence_expiry_warning_days`, never a constant. Two boundaries are
decided rather than inherited: an expiry falling **on** the reporting day is still valid,
because the last day counts, and one falling **on** the window's own edge is inside it.
`licence_date` has no `_display` sibling the way `flight_date` does, so the format it was
rendered in is undecidable from the capture — it serialises iso, like `flight_date`, and the
page renders it through the one date format this application prints.

**The status vocabularies are two, not one shared string.** §Tables below records the valid
state as `Platné`/`Platná` — two Observed forms. *Which* form belonged to `ŠKOLENIE` and
which to `OSVEDČENIE` was never captured, so that the split followed the two nouns'
grammatical gender is *(inferred)*; the two strings themselves are Observed. The rebuild's
two nouns are both neuter, so both read `Platné` today; the keys stay separate anyway,
because sharing one would be right by accident and wrong the moment a translator sees it.

**The headline training is the one that lapses soonest.** `training_status`, `training_date`
and `training_name` describe a single training out of the `trainings[]` beside them, and the
rebuild picks the nearest expiry — a training that never expires sorts last and is the
headline only where the pilot holds nothing that expires at all. The cost is deliberate: an
expired record the pilot has since renewed keeps the headline expired until it is removed.
Taking the latest expiry instead would let a lapse hide behind a valid record, which is the
gap-reading-as-a-pass this document rules out everywhere else. §Layout item 2's expiry-warning
banner and the `ŠKOLENIE` column of §Tables' pilots register are the two renderings of these
statuses, and neither recomputes one.

**One period-filtered half and one all-time half, in the same row.** `filtered_flights[]` and
`flights_by_device[]` are period-filtered and are grouped from the very rows `data.flights[]`
is serialised from — the same construction `data.devices[]` uses, which makes the agreement
structural rather than a property two queries have to keep. A flight naming no airframe lists
in `filtered_flights[]` and groups under nothing. `trainings[]` is **all-time**: a pilot's
qualification does not stop existing because the reader picked last month.

**The rebuild makes the two flight arrays agree, and the predecessor's did not.** Across the
27 captures `filtered_flights[]` holds 318 member occurrences and
`flights_by_device[].flights[]` holds 368. Grouping a subset can never exceed the whole, so
the predecessor's two arrays did not hold the same rows (Inferred from the occurrence counts;
the behaviour behind it was not observed). Parity is schema parity, so nothing fails — but the
rebuild deliberately serves the same rows through both, and the larger count is not a target
to be "fixed" towards. `trainings[].devices[]` is the other sparse path: 3 occurrences against
326 training rows, so almost every captured training covered no airframe (Inferred, same
basis). It is served as an array either way.

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
