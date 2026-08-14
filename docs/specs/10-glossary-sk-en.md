# 10 — Glossary (Slovak → English)

The existing system is Slovak-only. This maps its vocabulary to English so the rebuild
team can read the other documents, and so naming decisions are made once rather than
per-developer.

## Domain terms

| Slovak | English | Notes |
|---|---|---|
| CAMO | Continuing Airworthiness Management Organisation | The regulatory frame for the whole product |
| UAS | Unmanned Aircraft System | Used throughout for "drone"/airframe |
| Zariadenie | Device / aircraft | The `Device` entity |
| Prevádzkovateľ | Operator | The organisation holding the authorisation |
| Zodpovedný manažér | Responsible Manager | The accountable post in a CAMO org |
| Osvedčenie | Certificate / licence | Pilot competency certificate |
| Školenie | Training | Recurrent or initial training record |
| Prevádzkový výcvik | Operational training | A training type |
| ERP | Emergency Response Procedures | A training type / document |
| Let | Flight | |
| Letový záznam / log | Flight log | |
| Nálet | Flight time | |
| Cyklus | Cycle | One recorded flight = one service cycle |
| Údržba | Maintenance | |
| Servis | Service | |
| Incident | Occurrence / incident | |
| Povolenie | Permit / authorisation | |
| Prevádzková príručka | Operations manual | |
| Poistenie | Insurance | |
| Geozóna | Geozone | Airspace restriction zone |
| Zemepisná oblasť UAS | UAS geographical zone | The regulatory term for geozones |
| Neriadený priestor | Uncontrolled airspace | |

## Airspace and category codes

| Code | Meaning |
|---|---|
| VLOS | Visual Line of Sight |
| BVLOS | Beyond Visual Line of Sight |
| STS | Standard Scenario |
| A1/A3, A2 | Open-category subcategory certificates |
| SPECIFIC | The SPECIFIC operational category (requires authorisation) |
| CTR | Control Zone |
| ATZ | Aerodrome Traffic Zone |
| LZR | Restricted area |
| CHKO | *Chránená krajinná oblasť* — Protected Landscape Area |
| NO FLY | Prohibited zone (mapped with a 3.7 km buffer) |

## UI vocabulary

| Slovak | English |
|---|---|
| Administrácia | Administration |
| Prehľad | Overview |
| Používateľ / Používatelia | User / Users |
| Organizácia / Organizácie | Organisation / Organisations |
| Piloti | Pilots |
| Osoby organizácie | Organisation people |
| Formuláre | Forms |
| Letové povolenia | Flight permits |
| Prevádzková dokumentácia | Operations documentation |
| Všeobecné dokumenty | General documents |
| Typy zariadení | Device types |
| Typy školení | Training types |
| Mapy | Maps |
| Ovládače aplikácie | App controllers (ground controllers) |
| Synchronizované logy | Synced logs |
| Nepriradené sync lety | Unassigned synced flights |
| E-mailový denník | E-mail log |
| Mesačný prehľad | Monthly report |
| Systémový e-mail | System e-mail |
| Správa organizácie | Organisation management / report |
| Štatistiky letov | Flight statistics |

## Actions

| Slovak | English |
|---|---|
| Vytvoriť | Create |
| Upraviť | Edit |
| Odstrániť / Vymazať | Delete |
| Uložiť | Save |
| Zrušiť | Cancel |
| Zobraziť | View |
| Stiahnuť | Download |
| Nahrať | Upload |
| Priradiť | Assign |
| Priradiť existujúceho používateľa | Attach existing user |
| Odobrať z organizácie | Remove from organisation (detach) |
| Duplikovať | Duplicate |
| Blokovať | Block |
| Nahlásiť incident | Report incident |
| Hromadné akcie | Bulk actions |
| Vymazať vybrané / Odstrániť vybrané | Delete selected |
| Prepnúť stĺpce | Toggle columns |
| Resetovať | Reset |
| Použiť filter | Apply filter |
| Skryť / Skryť všetky | Hide / Hide all |
| Tlačiť PDF | Print PDF |
| Odhlásiť sa | Log out |

## Fields and states

| Slovak | English |
|---|---|
| Názov | Name / title |
| Meno a priezvisko | Full name |
| Sériové číslo | Serial number |
| Výrobca | Manufacturer |
| Stav | Status |
| Poznámka / Poznámky | Note / notes |
| Popis | Description |
| Dátum | Date |
| Platnosť do | Valid until |
| Platné / Platná | Valid |
| Vypršané | Expired |
| Bez expirácie | No expiry |
| Nenastavené | Not set |
| Nepriradený / Nepriradené | Unassigned |
| Bez organizácie | No organisation |
| Vytvorené | Created |
| Aktualizované | Updated |
| Nahrané | Uploaded |
| Nahral | Uploaded by |
| Importoval / Importované | Imported by / imported at |
| Veľkosť | Size |
| Verejné | Public |
| Hlavná kontaktná osoba | Primary contact |
| Aktívne / Neaktívne | Active / inactive |
| Vyradené | Retired / decommissioned |
| Čas letu | Flight time |
| Max. výška | Max altitude |
| Vzdialenosť | Distance |
| Celková vzdialenosť | Total distance |
| Počet letov | Flight count |
| Aktívni piloti | Active pilots |
| Tento mesiac / Minulý mesiac | This month / last month |
| Vlastné obdobie | Custom period |
| Obdobie | Period |
| Spracované | Processed |
| Prebieha | In progress |
| Úspech | Success |
| Čiastočný | Partial |
| Chyba | Error |
| Vo fronte | Queued |
| Duplicitné | Duplicate |
| Odoslané / Zlyhalo / Odosiela sa | Sent / failed / sending |
| Zranenia | Injuries |
| Priorita | Priority |
| Typ vrstvy | Layer type |
| Nie je geozóna | Not a geozone |

## Localisation notes for the rebuild

- **Decimal comma.** Slovak uses `,` as the decimal separator. The flight-duration field
  explicitly accepts `1,5`, and numeric columns render as `504,00`. Parse both separators
  and format per locale.
- **Date format** is `DD.MM.YYYY`; some tables use abbreviated Slovak month names
  (`aug 14, 2026`). The two styles are inconsistent in the original — pick one.
- **Diacritics** appear in names, filenames and slugs. Ensure UTF-8 end to end, including
  file storage, search and PDF generation.
- **Plan for English from the start** even if Slovak ships first. The current system has
  no i18n layer, and the terms above are its whole vocabulary — extracting strings now is
  far cheaper than retrofitting.
