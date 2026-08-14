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
