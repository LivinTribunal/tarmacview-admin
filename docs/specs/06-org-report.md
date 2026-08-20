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
standing autonomy grant and recorded on issue #97, and extended on 20 Aug 2026 on issues #101
and #104. The owner has not reviewed it: settled enough to build on, open enough to overturn.
Items 1–7 above are what was Observed and stay standing; only the page's own choices are below.
Of item 7 only the documents panel is built — §"The documents panel in the rebuild" is its own —
and the maps panel and the flight-log upload panel are each their own slice. Item 3's `Tlačiť
PDF` is built, and what it produces is §"The print view in the rebuild".

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
the rule. The printed pack was the surface most likely to need the time of day and it does
not — §"The print view in the rebuild" settles that, for both surfaces at once.

**The expiry-warnings block lists three statuses and stays silent on two.** `expiring`,
`expired` and **`none`** each list under their own label; `valid` and `noExpiry` produce no
row, per the affirmative-only rule [05-organization-workspace.md](05-organization-workspace.md)
owns. Keeping `none` apart from `noExpiry` is §"`data.pilots[]` in the rebuild" applied to a
screen, and holds here for the reason it gives there. A pilot with nothing to surface has no
row, and where nobody has anything the block is **absent** rather than printing an all-clear —
the same rule §"`has_vlos_violation` is false in three different situations" is held to.

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
`Tlačiť PDF`, which item 3 puts beside the selector, is an **anchor** rather than a field of
that form: it carries the query string the request arrived with, so what a reader prints is the
screen they pressed it on.

**The pilot filter item 5 names is a field of that same form, and narrows the payload rather
than the rendered rows.** `pilot_id` is already the endpoint's filter vocabulary above, so
filtering by pilot changes `total_flights`, `total_flight_hours` and `active_pilots` with it —
the shared index table's own in-memory filter panel would narrow the rows and leave the tiles
above stating the unfiltered period. One submit is therefore one payload, and the two cannot
disagree. Its options are the whole roster whatever the filter says and whether or not the range
was usable, so a reader who mistyped one keeps the control that widens back out; an empty value
is *all pilots*, which is the absent-and-empty-alike reading `pilot_id=` already has, and an id
that names nobody on the roster selects a **disabled placeholder** — without it the control would
read *all pilots* over a table narrowed to nothing.

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
as it reads; the rebuild departs from it. An address is linkable, it needs no client component,
and it cannot disagree with the payload the page already holds — and being an address rather
than client state is what let the print view decide for itself whether to read one. It **does
not**: `detail` rides onto the print link unread, because a pack carrying one pilot's history
and nobody else's is a document about that pilot rather than about the operator (§"The print
view in the rebuild"). Neither detail issues a read: `trainings[]`, `filtered_flights[]`,
`flights_by_device[]` and `maintenance_logs[]` are all already in that payload, and the page makes
the same reads with a detail open as with none. The `{id}` is resolved against the rows in hand, so
one naming none of them opens no detail — which makes the scoping structural rather than a
discipline, because another operator's id was never in the payload to be found.

**All three registers render the shared index table and none declares a row action.**
Visibility, search, sorting and pagination are behaviours
[04-admin-resources.md](04-admin-resources.md) §"Shared table behaviour" already owns, and a
component that takes rows and never queries is exactly what a payload-fed table needs. The two
tabs' registers declare no edit route: a detail is a disclosure rather than a route, and the row
link on the identity column is what opens it. The flights table declares no link at all — a
flight has no detail view, and its `Priradiť` fallback is a write rather than a disclosure. No
column declares itself sortable — §Tables captured no sort marker on any of the three, and
inventing one is a behaviour nobody observed; the flights table renders in payload order, which
is the read's own, and an ordering added later keys off `flight_date_sort` rather than
re-deriving `flight_date`. The in-memory ceiling `src/lib/table/view.ts` records does not bind
here: this table is period-filtered and its filter narrows the payload, so it is bounded by a
month rather than by the flights register.

**§Tables records Slovak for all three tables, and what this slice mints sits below them.**
Marked here so neither half comes to read as the other's, because unmarked means Observed and a
capture re-minted as a rebuild decision is the same error as a promotion, taken the other way.

**Observed, and used as captured**: `Štatistiky pilotov`, the five pilot headings, `Detail
pilota`, `Detail UAS`, `Platné`/`Platná`, `Pridať záznam údržby`, and the whole flights entry —
`Lety za vybrané obdobie`, `STAV`, `DÁTUM`, `PILOT`, `UAS`, `ČAS LETU`, `MAX VÝŠKA (M)`,
`VZDIALENOSŤ (M)` and the `Priradiť` fallback. Headings render in sentence case — the capture's
all-caps is appearance, and the clean-room line takes the wording and not the styling, exactly as
it takes the state and not the amber a status inside the warning window was drawn in. They are
reused as captured and not "corrected" towards the admin panel's spelling of the same field:
`Vzdialenosť (m)` keeps the capture's wording where §FlightResource says `Max. vzdialenosť (m)`,
and `Max výška (m)` keeps its unabbreviated `Max` for the same reason.

`Lety za vybrané obdobie` is keyed **twice**, and deliberately. It labels the flights table and
it labels *Detail pilota*'s period flights, which are one pilot's flights against every flight —
two headings that happen to coincide, and §"The status vocabularies are two, not one shared
string" is the precedent for keeping them apart. `Stav` and `Dátum` come from this same capture
and are one `report.column.*` family across both surfaces.

**The rebuild's own, because §Tables records nothing to take.** The UAS tab's Slovak label was
never captured — §Tables gives it as *UAS tab* and no more — so the rebuild names it `UAS`, and
its column set is the rebuild's reading of *per-airframe totals and service state*, which is all
that entry records. The two VLOS labels the `STAV` cell renders are the rebuild's too — §Tables
records the flag's existence and no wording for it — and so are the pilot filter's own three
strings, which item 5 names without giving any. Nothing at all is recorded for the service block,
and the maintenance history only as English field names, so both are labelled fresh — over the
payload's own service keys and [03-data-model.md](03-data-model.md) §MaintenanceLog's columns,
exactly as `maintenance_logs[]`'s member shape is. What a detail view is not the first to label
it reuses from the register that already labels the same field, rather than minting a second
string ([04-admin-resources.md](04-admin-resources.md) §TrainingResource, §FlightResource,
§DeviceTypeResource).

**The UAS table's service cell reads `service_warning` and never `service_due`.** Three states
render as three: the gap names itself, a due service names itself, and one that is not due renders
the blank marker under the affirmative-only rule. An airframe with no device type has no VLOS limit
and no service interval, so `service_due: false` beside it is *not knowable* rather than an
all-clear — the same shape §"`has_vlos_violation` is false in three different situations" is
held to. In `Detail UAS` the maintenance readings render as the technician stated them: the
hours are text in either notation, and a null `total_flights` names the absence rather than
printing `0`, which would be a reading nobody took.

**All three tables sit inside the report body that the query error replaces.** The pilots
table's two count columns are the period's own figures, the UAS table has none without a payload
and the flights table *is* the period, so an unusable range renders the error here too rather
than a register of zeroes stating that nothing was flown. The warnings block above them stays
outside that body, for the reason the selector paragraph gives; so does the period form, which
is what a reader corrects the range with.

**In the flights table a failed parse and an unassigned flight are ordinary rows.** Nothing
filters on `parsing_status`, `pilot_id` or `device_id`: a flight whose parse failed keeps its row
with its status and its error, because dropping it loses the evidence that a flight happened, and
an unassigned one renders the named absences `pilot_name` and `device_serial_number` already
carry. §Tables records an inline `Priradiť` button on those two cells and the rebuild renders
**none**: the write behind it is §"Assign pilot / aircraft to a flight", which is not served yet,
and a button that does nothing tells a reader an action exists.

**`STAV` is one cell carrying two axes, and the VLOS half answers three ways.** The parsing
status with its error, and the VLOS answer, stay distinguishable rather than folded into one
state — they are independent, and folding them loses one. The VLOS half is the consequence the
endpoint section above wrote down in advance: `has_vlos_violation: true` names the violation, a
limit present with the flight inside it renders **nothing** under the affirmative-only rule, and
no limit at all — because the airframe has no device type, its type sets none, or the flight
names no airframe — **names the gap**. The gap is read off `data.devices[].max_vlos_meters`,
which is null in exactly those cases, resolved against the airframes the page already holds; a
cell keyed off the boolean would print the same nothing for the gap and the pass.

**One ceiling on that, stated rather than papered over.** The third false branch — no distance
was recorded — is not distinguishable in the payload: `max_distance` serialises a null as `0` to
hold parity, so a recorded zero and no reading at all are one figure, and a fourth key would fail
parity. The cell therefore reads `max_distance: 0` as **not judged**. A flight that genuinely
flew zero metres names a gap it does not have, which is noise; the other direction is a gap
reading as a pass, which is the error this document rules out everywhere.

**`/` forwards here** — to the acting session's primary organisation report. Which organisation
it resolves to, and where a session that is the primary contact of nothing lands instead, are
decided in [09-roles-permissions.md](09-roles-permissions.md) §"Sign-in and sign-out".

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
`max_distance` serialise a null as `0` to hold parity — except that `has_vlos_violation` is
computed from the *column* rather than from the serialised figure, so **the boolean** never
mistakes a flight that recorded no distance for one that recorded zero. A reader of the
payload has no such column, which is the ceiling §"One ceiling on that" above states for the
flights table's own distance cell. `parsing_errors` serialises a null as `""`, which is the
one blank here that is honest: no error recorded is exactly what an empty message means.
`parsing_status` does not, and gets a label naming the nothing-was-parsed case — a null
status is the manual-entry case, and reporting a parsed state or a blank would state an
outcome that never happened
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

### The print view in the rebuild — decided

A **decision about the rebuild**, taken on 20 Aug 2026 by the rebuild loop under the owner's
standing autonomy grant and recorded on issue #109. The owner has not reviewed it: settled
enough to build on, open enough to overturn. `Tlačiť PDF` and the path above are Observed;
**the document's content, its order, the stamp format, the printed error and what the route
ignores are all the rebuild's own**. The five query parameters are this section's line and
`resolveSelection`'s vocabulary, not a captured one: `contracts/routes.json` fetched this path
nine times and never with a filter, so it records no query vocabulary for it.

**A second rendering, and never a second report.** The screen and the pack make the same reads
through one shared composition, in one `withTenant` transaction, and render keys off one
payload — a third hand-copied composition of it is exactly the drift §"The report page in the
rebuild" rules out, on the document least able to carry it. Two derivations of one number on a
regulator-facing pack is the worst place in the product for them to disagree.

**The pack is §Layout items 1 to 6, and item 7's action panels are not on it.** The documents
panel's links are inert on paper, `Nahrať letové povolenie` is a write, and the admin link and
sign-out are navigation: a printed pack carries **evidence and not affordances**. The header,
the expiry warnings, the tiles and all three tables are what remains, in that order.

**No pagination, and no shared index table.** The chrome is a client component whose default
page size is ten, so a pack rendered through it would drop row eleven of a register silently —
the gap-reading-as-a-fact this document rules out everywhere, in its worst form. The registers
render as plain server-side tables from the **same** `TableDeclaration`s the screen uses,
reading `labelKey` and `key` and ignoring `linkPath`, which is the only part of a declaration
that is chrome. Minting a second column list would let the pack and the screen come to disagree
about what a register contains. Every row prints, in the payload's own order, through the same
`formatCell` the chrome applies — a table without the chrome must not grow a second decimal
comma beside the chrome's.

**Both registers print, because a tab is an address on screen and not a section of a document.**
`tab` is unread here, and so is `detail`; the page's unrecognised-tab not-found branch is
deliberately **not** copied, or a parameter this rendering ignores could still refuse the pack.

**The pack states the selection it was produced under.** The screen shows its narrowing in the
controls the reader submitted it with and a document has none, so the period renders as the
screen's own `report.period.selected` line and the pilot filter renders beside it — named,
*all pilots*, or the placeholder for an id the payload does not carry, which are the three
states the selector already resolves. `device_id` is in the wire vocabulary above and no
control sets one, so its line renders only where one was asked for. Both are resolved against
the rows the payload already holds, which is the `?detail={id}` reading and structural for the
same reason. The two strings for the airframe line are the rebuild's own, filed beside the
pilot filter's three; `Tlačiť PDF` is Observed and used as captured.

**The generation stamp stays a date here too, which resolves what §"The report page in the
rebuild" deferred.** `src/lib/i18n` resolves every date in UTC and records that which zone a
reader should see an instant in wants an organisation or a browser to key off, and neither
exists yet — so a clock time on a Slovak regulator-facing pack would print UTC and read as
local, a **stated figure wrong by two hours in August**, which is worse than no figure at all.
A second format would also have to land on the screen, or one stamp would render two ways. What
distinguishes two packs printed the same day is the period line, which both surfaces carry. If
a time of day is ever genuinely needed it is a `formatDateTime` in `src/lib/i18n` applied to
both surfaces, never a `toLocaleString` at a call site.

**An unusable range prints the query error, never a pack of zeroes.** The page's own
substitution, for the reason it makes it: the header and the expiry warnings take no period and
survive, while a mistyped range must not withdraw a lapsing certificate — and a pack whose
figures are zero would say nothing was flown when what happened is that two dates arrived the
wrong way round. No new string and no redirect back to the screen: the reader arrived from the
selector, and that is the way back to correcting it.

**`Tlačiť PDF` is Observed wording for a control and not a commitment to generate a PDF.** The
route serves HTML — which is what the capture recorded for it — and the browser prints it. A
PDF toolchain is a dependency, a rendering surface and a font-embedding problem, and nothing
observed requires one. **No CSS ships with this slice either**: there is no stylesheet anywhere
in the rebuild yet, so a print stylesheet would be the first, and branding is ours and is
defined separately. Semantic markup with no chrome prints acceptably; styling lands with the
design system that owns it.

## Documents panel

`Dokumenty, formuláre a letové povolenia` expands into four counted groups:
`Dokumenty (n)` · `Formuláre (n)` · `Letové Povolenia (n)` · `Incidenty (n)`, each listing
downloadable files, plus a `Nahrať letové povolenie` action.

This is the read side of the org workspace registers (doc 05) — operators consume here
what admins curate there.

### The documents panel in the rebuild — decided

A **decision about the rebuild**, taken on 20 Aug 2026 by the rebuild loop under the owner's
standing autonomy grant and recorded on issue #107. The owner has not reviewed it: settled
enough to build on, open enough to overturn. Everything above this line is what was Observed;
`Nahrať letové povolenie` is a write and is not built.

**Which bucket each group reads, and one of the four is *(inferred)*.** `Formuláre` reads
the `forms` bucket and `Letové povolenia` the `permits` bucket, which is what the oracle's own
path names say. `Dokumenty` reads **`operations`** — [05-organization-workspace.md](05-organization-workspace.md)
§5's *Prevádzková dokumentácia* — and that pairing is inferred rather than captured: three
oracle download paths, three tenant buckets, and the two named ones leave it. The alternative
is that `Dokumenty` is the `general` library every session reads. It is not read that way here,
because both this section and the issue say *the organisation's own buckets*, and the global
library is nobody's. `Incidenty` reads the occurrence register, §6's.

**`is_public` is not what the permits group filters on.** Doc 05 §4 flags its own ambiguity
for this document to settle, and the answer is that every permit the organisation holds lists.
Filtering on the flag is wrong twice over: §Access above records that **nothing here serves
anonymously**, so *public* has no surface on which to mean anything; and the column is `not
null default false`, so a bucket nobody has ticked would read `Letové povolenia (0)` while the
operator's permits sit in the register — a gap reading as a fact on a regulator-facing pack.
The flag's consumer is the explicit revocable share link §Access asks for, which has no slice
yet.

**A count of zero is a fact and renders as one.** An empty bucket keeps its group and states
`(0)`, and a panel whose four groups are all empty still renders. This is **not** the
affirmative-only rule's territory: that rule is about a boolean that cannot tell a real *no*
from an unrecorded one, and a count is a figure over a bucket that was actually read. An
operator looking for a permit needs to see the bucket empty rather than the panel missing.

**The panel takes no period, so it survives an unusable range** — the expiry-warnings block's
reasoning above, unchanged. Its four reads run in both branches of the page's transaction, and
withdrawing an operator's permits because two dates arrived the wrong way round would be the
mistake §"The report page in the rebuild" already rules out for the warnings.

**The three download paths are mounts of the handler that already exists, not new handlers.**
[03-data-model.md](03-data-model.md) §"Serving a stored file in the rebuild" owns that
distinction and the count behind it. The cost is stated rather than hidden: on a mount the
`{org}` segment is unread and the bucket in the path does not filter, so one permit id resolves
through all three paths. The alternative — a reader selecting on the path's organisation and
category — is **worse for the property that matters**: a selection clause would answer the
cross-tenant case on its own, and the isolation assertion would then pass with
`document_tenant_isolation` dropped. A mount leaves row-level security as the only thing
standing there.

**The fourth group reaches its file through `/api/incidents/{id}/file`.** `contracts/routes.json`
carries three download paths and nothing for incidents, so no fourth report path is minted — the
same reuse the header's logo makes of the route that already serves one. An occurrence report
naming no file **keeps its entry and names the gap** rather than linking: `incident.file_path` is
nullable, a link on it would point at a route answering not-found, and dropping the row would
lose the evidence that an occurrence was filed. It stays counted for the same reason.

**Plain markup and not the shared index table.** Four `resource` keys would pollute the
column-visibility store for four short download lists, the chrome offers search, sorting and
pagination a list of files does not want, a client component's state does not survive the print
view, and the count belongs in the group's own heading, which a `TableDeclaration` has no place
for. This is the detail views' reasoning above, which is also why the panel's pure half sits in
`src/lib/report/view.ts` rather than as a declaration in `src/lib/report/fields.ts`.

**Observed, and used as captured**: `Dokumenty, formuláre a letové povolenia`, `Dokumenty`,
`Formuláre`, `Letové povolenia` and `Incidenty`, in sentence case — the wording and not the
styling, exactly as the flights table takes `Max výška (m)`. They take their own
`report.documents.*` family rather than reusing `document.category.*`: these come from a
different capture, and `Lety za vybrané obdobie` above is the precedent for keeping two headings
that coincide apart. **The rebuild's own**: the `(n)` formatting, carried as a `{count}`
placeholder inside each label so a label and its number stay one translatable string; and the
label for an occurrence report that names no file, the treatment
`report.maintenance.totalFlights.none` sets. There is no empty-state sentence, because `(0)` is
the statement.

## Maps panel

Each map assigned to the organisation renders as a collapsible Leaflet iframe
(`/map/{slug}/embed`) with an `Otvoriť plnú mapu` link. See doc 08.
