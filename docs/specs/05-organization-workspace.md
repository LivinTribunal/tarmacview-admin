# 05 — Organization workspace

`/admin/organizations/{org}/edit`

The most important screen in the admin panel. The organisation form sits at the top
(fields in doc 04), and below it seven tabbed sub-registers, addressed as
`?activeRelationManager={n}`. Together they are the operator's compliance file.

| n | Tab | Manages |
|---|---|---|
| 0 | Osoby organizácie | People with a formal role in the organisation |
| 1 | Piloti | The pilot roster |
| 2 | UAS | The aircraft register |
| 3 | Formuláre | Blank forms |
| 4 | Letové povolenia | Flight permits |
| 5 | Prevádzková dokumentácia | Operations manuals |
| 6 | Incidenty | Occurrence reports |

The tabs load lazily — each is fetched only when opened.

---

## 0 · Osoby organizácie (organisation people)

The accountable-person register: who holds which post, and who is the primary contact.

**Columns:** `Meno` · `Rola` · `E-mail` · `Telefón` · `Pozícia` · `Hlavná`
**Filters:** `Rola` · `Hlavná kontaktná osoba`
**Row actions:** `Upraviť` · `Odobrať z osôb organizácie` (detach, not delete)

**Header action — `Priradiť existujúceho používateľa`** (attach an existing user):

| Field | Control | Rules | Helper |
|---|---|---|---|
| Vyberte používateľa | select (searchable) | required | *"Must have a real e-mail to be able to log in"* |
| Rola osoby v organizácii | radio | required | |
| Hlavná kontaktná osoba | toggle | | |

**Header action — `Vytvoriť osobu organizácie`** (create a new one):

| Field | Control | Rules |
|---|---|---|
| Meno a priezvisko | text | required, ≤255 |
| E-mail | email | **required** |
| Heslo | password | required; ≥8 chars, ≥1 letter, ≥1 digit; blank on edit = unchanged |
| Potvrdenie hesla | password | must match |
| Rola osoby v organizácii | radio | required |
| Telefónne číslo | tel | ≤255 |
| Pozícia | text | ≤255 |
| Číslo osvedčenia | text | ≤255 |
| Hlavná kontaktná osoba | toggle | |
| Poznámka | textarea | |

Note the contrast with the pilot form below: **an organisation person must have an e-mail
and password; a pilot need not.** That asymmetry is the design — accountable people are
accounts, pilots are records. Preserve it.

---

## 1 · Piloti (pilot roster)

**Columns:** `Meno` · `Email` · `Číslo Osvedčenia` · `Telefón`
**Row actions:** `Upraviť` · `Odobrať z organizácie` (detach)
**Bulk:** `Odobrať z organizácie`

**Header action — `Priradiť existujúceho používateľa`:** a single searchable select
(*"start typing a name or e-mail to search all users"*), so a pilot can belong to more
than one organisation.

**Header action — `Vytvoriť nového pilota`:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Meno a priezvisko | text | required, ≤255 | |
| Telefónne číslo | tel | ≤255 | |
| Poznámka | textarea | | |
| Vytvoriť prihlasovací účet | toggle | | *"Enable only if the pilot needs to log in to the report"* |
| Číslo Osvedčenia | text | | Pilot certificate number |
| Typy osvedčení | multi-select | | A1/A3, A2, STS |
| Platnosť do | date | | Certificate expiry |
| Trainings | repeater | | Training records inline |

The login toggle is the mechanism behind nullable `email`/`password` on User. When off,
no credentials are issued and the pilot exists purely as a subject of flight records.

---

## 2 · UAS (aircraft register)

**Columns:** `Zariadenie` · `Model` · `Typ zariadenia` · `Výrobca` · `Stav`
**Filters:** `Stav`
**Row actions:** `Upraviť` · `Vymazať` · **Bulk:** `Vymazať vybrané`

**Header action — `Pridať nové UAS`:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Názov zariadenia | text | ≤255 | Friendly label |
| Sériové číslo | text | **required**, ≤255 | The airframe's real identity |
| Model | text | ≤255 | |
| Výrobca | text | ≤255 | |
| Typ zariadenia | select | | *"Max VLOS is taken from the selected device type"* |
| Stav | select | required | `Aktívne` \| `Neaktívne` \| `Údržba` \| `Vyradené` |
| Záznamy údržby | repeater | | Maintenance log entries inline |
| Poznámky | textarea | ≤65535 | |

`Typ zariadenia` is frequently `Nepriradený` (unassigned) in live data. That matters:
**without a device type there are no service intervals and no max-VLOS**, so service
tracking and VLOS-violation detection silently do nothing for that airframe. The rebuild
should surface that as a visible gap rather than an invisible default.

Maintenance entries are also creatable from the operator report (doc 06), which is where
they realistically get filled in.

---

## 3 · Formuláre (forms)

Blank forms the operator distributes or files.

**Header action — `Pridať formulár`:** `Názov formulára` (required, ≤255) ·
`Súbor` (required) · `Poznámka` (textarea)
**Bulk:** `Odstrániť vybrané`

Table columns not observed — the register was empty for the inspected organisation. It
uses the same field shape as documents; assume `Názov` · `Súbor` · `Veľkosť` · `Nahral` ·
`Nahrané`.

---

## 4 · Letové povolenia (flight permits)

**Columns:** `Názov súboru` · `Verejné` · `Veľkosť` · `Nahral` · `Nahrané`
**Filters:** `Verejné`
**Row actions:** `Stiahnuť` · `Upraviť` · `Odstrániť` · **Bulk:** `Odstrániť vybrané`

**Header action — `Pridať povolenie`:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Súbor povolenia | file | required; `.pdf,.jpg,.jpeg,.png,.doc,.docx` | *"The filename will be used as the permit name"* |
| Verejné | toggle | | *"Tick if the permit should be visible on the organisation's public page"* |

The only document bucket with a public flag. Permits marked public appear on the operator
report. Note the wording says "public page" while the report itself requires a session
(doc 06) — reconcile that intent during the rebuild rather than copying the ambiguity.

Permits are also uploadable directly from the report via `POST …/upload-permit`.

---

## 5 · Prevádzková dokumentácia (operations documentation)

**Columns:** `Názov` · `Súbor` · `Veľkosť` · `Nahral` · `Nahrané`
**Row actions:** `Stiahnuť` · `Upraviť` · `Odstrániť` · **Bulk:** `Odstrániť vybrané`

**Header action — `Pridať dokument`:** `Názov dokumentu` (required, ≤255) ·
`Súbor` (required) · `Poznámka` (textarea)

Holds the operations manual, ERP procedures, checklists, insurance certificates, UAS
registration and the SPECIFIC permit — i.e. the operator's standing compliance pack.

---

## 6 · Incidenty (occurrence reports)

**Filters:** `Posledných 30 dní` (last 30 days)
**Bulk:** `Odstrániť vybrané`

**Header action — `Nahlásiť incident`:**

| Field | Control | Rules | Helper |
|---|---|---|---|
| Názov incidentu | text | **required**, ≤255 | |
| Popis | textarea | **required** | |
| Dátum incidentu | date | **required** | |
| Priradený let | select | optional | *"Optionally link the incident to a flight"* |
| Zranenia | toggle | | *"Were any persons injured?"* |
| Poznámky | textarea | | |
| Súbor incidentu | file | ≤50 MB; PDF, DOC, DOCX, images | |

Table columns not observed — the register was empty. Expect at least
`Názov` · `Dátum` · `Let` · `Zranenia`.

Incidents are also counted on the operator report's documents panel.

---

## Sub-registers elsewhere

Two more relation managers exist outside this workspace:

**User → Školenia** (`/admin/users/{id}/edit?activeRelationManager=0`)
Columns `Názov` · `Typ` · `Zariadenia` · `Dátum školenia` · `Platnosť do`;
filters `Vypršané` / `Platné`; actions `Pridať školenie`, `Upraviť`, `Odstrániť`,
`Odstrániť vybrané`. Same shape as `TrainingResource`, scoped to one pilot.

**Flight → Detaily letov** and **Map → KML súbory** are covered in docs 04 and 08.

---

## The workspace in the rebuild — decided

A **decision about the rebuild**, taken on 17 Aug 2026 by the rebuild loop under the owner's
standing autonomy grant and recorded on issues #70, #73 and #75. The owner has not reviewed
it: settled enough to build on, open enough to overturn. Everything above this line is what
was Observed of the predecessor, and nothing here may be edited into it — in particular the
tab table and the two *"columns not observed"* notes stay exactly as they are.

**The route segment is `{org}`, and so the directory is `[org]`.** Every sibling register is
served from an `[id]` directory, and this one is not: `tests/contracts/routes.test.ts` maps a
`[segment]` directory to `{segment}` and the oracle spells the path
`/admin/organizations/{org}/edit`. The oracle is never edited to agree with us, so the habit
is what gives way. Declared row actions still substitute `{id}`, which is the chrome's own
placeholder and a different layer.

With the route served, `/admin/organizations` joins the register list the route contract
asserts, so all three of its captured paths — the index, `create` and this one — are covered
rather than asserted by nothing.

**The tab is a query parameter and only the active tab reads.** `?activeRelationManager={n}`,
as the oracle records it: not a path segment and not a fragment. An absent or unparseable `n`
renders the first tab. An out-of-range one is **not-found**, never a silent fallback — a link
to a tab that does not exist is a broken link and should read as one, and a fallback answers
200 for a tab nobody built.

The tabs *"load lazily"* above is Observed of a screen that fetched on click. The rebuild
renders one tab per request and runs that tab's query alone, which satisfies the same claim:
the behaviour is preserved, the mechanism is not.

**The organisation filter is a selection, not a boundary.** Every built tab's read carries
`where organization_id = {org}`, which is the clause every file in the rebuild's tenant layer
says it deliberately does not have. Both are true, and the distinction is the point:
row-level security decides which rows the acting session **may** see at all; this clause
decides which of those it is **looking at**. It is the same line
`src/lib/tenant/scoped-documents.ts` draws for the document bucket.

Concretely, and asserted rather than claimed for the fleet and for the people alike: dropping
the clause widens the register to what the acting session already reads across their *own*
organisations and never past them. That is the difference between a wrong screen and a
breach.

**An organisation you hold no membership of is not-found.** The scoped read returns no row, a
page with nothing to render is not-found, and no branch anywhere asks whether the session is
allowed — refusing would confirm the organisation is real. A `superadmin` reaches every
organisation. This is the workspace's one security property and it is asserted against a
real database and the real policies.

**All seven tabs are built.** Each is an index table over an organisation-scoped read and
nothing more.

**§6's column list is *(inferred)***, the way §3's is and for the same reason: §6 above records
the register as empty and says *"Expect at least"* four columns. The rebuild declares those
four — `Názov` · `Dátum` · `Let` · `Zranenia` — and invents no fifth, so nothing here is
presented as captured. `Let` renders the linked flight's own display name and is blank where
the report names none, which §6 calls *optional* and
[03-data-model.md](03-data-model.md) §"Incidents in the rebuild" keeps writable.

The file §6 records is served, like §3's, §4's and §5's — but through a route of its own rather
than the document one, because it is a column on its own table. **No cell links to it**: §6
names no file column, the column is nullable, and a link on every row would point at nothing
for every report carrying no file.

**There is no relation-manager abstraction, and the document buckets settled that rather
than deferring it.** Six tabs was where a shape was expected to become visible. What
generalised is the **read**: §3, §4 and §5 select `document` by organisation and by bucket,
differing only in the constant, so they share one function and each states its own bucket.
What did not generalise is the **declaration**. §4 is not shaped like §3 and §5 — it carries
`Verejné`, which no other bucket has, and its first column is the filename rather than the
name, per [03-data-model.md](03-data-model.md) §Document's *required (except permits, which
take the filename)* and §4's own helper text. One declaration over a bucket constant would
have had to either hide `Verejné` or invent it for the other two. So: three declarations,
one read.

§3 and §5 do agree column for column, and are still declared separately, because the two
lists have different provenance — §5's is Observed and §3's is the *(inferred)* shape this
document assumes for an empty register. Sharing one list would let a later correction to the
inferred one silently rewrite the observed one.

**Tabs 0 and 1 are disjoint on the organisation role** *(inferred)*. §0 and §1 do not say
which memberships each lists, and two readings fit: tab 0 lists every membership and tab 1
lists the pilots again, or the two are disjoint. The rebuild takes the second — tab 0 is
every membership whose role is not `pilot`, tab 1 is the pilots — because §0 calls itself the
accountable-person register and a CAMO's accountable people are not its pilot roster; listing
pilots among the accountable misrepresents who is accountable, which in a compliance tool is
the worse error. `viewer` and `operations` fall in tab 0 with `accountable_manager`.

Nothing is hidden either way, and that is the property asserted rather than the predicate:
the two tabs together cover every membership of the organisation and neither lists a person
the other does. `membership.role` is `not null` and a person holds at most one membership per
organisation, so both halves follow from the schema. What would settle the marking is a
captured record showing a pilot in §0's table; the crawl has none, and the register was
populated.

**The account asymmetry §0 states is recorded, not enforced here.** An organisation person
must have an e-mail and a password and a pilot need not — accountable people are accounts,
pilots are records. Nothing in the rebuild writes yet, so this slice owes only that neither
tab's *read* contradicts it: a pilot with no e-mail lists normally in tab 1 and the empty
cell reads as a gap, never as a broken row. See
[03-data-model.md](03-data-model.md) §"Account provisioning in the rebuild" for what the
write path will do with it.

**`is_public` is surfaced and nothing about it is decided.** §4's tab renders `Verejné`,
stating the affirmative where the flag is set and nothing where it is clear — the shape and
the reasoning §"`Hlavná` renders the flag and never a negative" below already sets out, plus
one reason of its own: it puts the word on the rows that carry the exposure rather than on
the rows that do not.

The ambiguity §4 records above — the toggle says *public page* while the operator report
requires a session — is **not** reconciled by showing the flag. That reconciliation belongs
to [06-org-report.md](06-org-report.md), when the report is built, and no handler reads
`is_public` yet: the file route serves every byte to a resolved session and has no branch for
it, which is what [03-data-model.md](03-data-model.md) §"Serving a stored file in the rebuild"
means by a public read being an explicit opt-in.

**The `Verejné` filter is deferred, and it is the natural first one.** No register in the
rebuild declares a filter yet. `Pilot` and `Zariadenie` were deferred on `FlightResource`
because the filter type takes a static option list and those need per-tenant options;
`Verejné` is the opposite case — two fixed values, which is the shape that type already has.
Declaring it is a decision about the filter panel rather than about this tab, so it waits,
and the tab's declaration says so rather than leaving the omission silent.

**`Hlavná` renders the flag and never a negative.** `is_primary_contact` is
`not null default false`, so the column cannot tell "this person is not the primary contact"
from "nobody ever set one". The cell states the affirmative where the flag is set and is
blank where it is not; a negative word in every row would state a fact the column does not
carry. An organisation with no primary contact therefore reads as a gap, which is what it is.

**`Zranenia` is the exception, and states three things.** §6's toggle asks *"Došlo k zraneniu
osôb?"*, and the rebuild makes `incident.injuries` **nullable** where the two columns the rule
above covers are `not null default false` — see
[03-data-model.md](03-data-model.md) §"Incidents in the rebuild". So the reasoning that
produced the rule does not reach it: a column that *can* tell an answered **no** from an
unanswered question is not stating a fact it does not carry when it prints one. The cell
renders `Áno` where somebody answered yes, `Nie` where somebody answered no, and the blank
marker where nobody answered at all.

It is written down here, beside the rule and as a deliberate exception, because that is where
the argument for one belongs — the alternative is a divergence a later audit discovers and
files as a defect. What earns it is the record rather than the column type: an occurrence
report is a form somebody filled in, and *"no, nobody was injured"* is the answer a CAMO is
keeping the report for. Collapsing it into the same blank as *nobody said* would read as an
all-clear on the one register where the absence of one is the finding. **Nothing about
`Hlavná`, `Verejné` or `Tmavá mapa` changes**: all three remain `not null default false` and
all three remain affirmative-only.

`Telefón` and `Pozícia` were not on the rebuild's `person`; migration `0012` adds them and
`Poznámka` is left out — see [03-data-model.md](03-data-model.md) §"Contact and job-title
columns in the rebuild".

Two readings of §2 above that the capture does not settle:

- **`Zariadenie` carries the serial number** *(inferred)*. Which field sat under that header
  was not observable, and the five columns record no separate `Sériové číslo` — an aircraft
  register that never shows the serial is not one a CAMO could use. What settles it for the
  rebuild either way is that `Názov zariadenia` is nullable and the serial is not, and an
  identifying column that is blank for the normal case identifies nothing.
- **`Typ zariadenia` states the gap and is never blank.** §2 records the unassigned state as
  frequent; the rebuild renders it as its own wording rather than as the blank marker, which
  would read as an unfilled cell. Without a device type there is no VLOS limit and no service
  interval, so the airframe can never register a violation or a service warning — see
  [03-data-model.md](03-data-model.md) §Device.

**No row action, no bulk action and no filter** on any of the seven tabs. `Upraviť`,
`Vymazať`, `Vymazať vybrané`, `Odstrániť`, `Odstrániť vybrané`, the `Stav`, `Rola`, `Verejné`
and `Posledných 30 dní` filters, `Hlavná kontaktná osoba` and the two `Odobrať` actions are all
Observed and all from a GET-only capture; no route is served for any of them and no write path
exists, so the declarations carry none of them rather than offering chrome wired to nothing.
The `Verejné` filter is the one with a reason of its own, two sections up — and §6's
`Posledných 30 dní` is the opposite case again, a relative date window rather than a fixed
option list, so it needs more of the filter panel than `Verejné` does rather than less.

`Stiahnuť` is the exception, and it is a **read**: §3, §4 and §5 each link the filename cell
at the one file route, so the action is served rather than deferred.

When one is wired, `Odobrať z organizácie` and `Odobrať z osôb organizácie` remove a
**membership** and never a person — [CONTEXT.md](../../CONTEXT.md) §"Attach / detach".
Detaching a pilot who has flown must leave the flight history that names them intact.
