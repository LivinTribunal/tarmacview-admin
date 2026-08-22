import { fileURLToPath } from 'node:url'
import type { Database } from '@/lib/db/client'
import {
  device,
  deviceType,
  document,
  flight,
  flightLog,
  incident,
  maintenanceLog,
  map,
  mapKmlFile,
  mapOrganization,
  membership,
  organization,
  person,
  training,
  trainingDevice,
  trainingType,
} from '@/lib/db/schema'

// every value here is invented. no pilot name, e-mail address, licence number, airframe
// serial or organisation token from the predecessor belongs in this repo, and a
// realistic-looking 32-hex report token trips the conventions gate by design. the logo
// under storage/ is an invented placeholder square, drawn here rather than fetched.

// the disk half of the fixtures. a test that serves a file points FILE_STORAGE_ROOT at
// this directory, so the storage root stays configuration in tests too - nothing reads a
// literal path out of the application.
export const FIXTURE_STORAGE_ROOT = fileURLToPath(new URL('./storage', import.meta.url))

// only alpha names a file. bravo and charlie keep a null `logo_path`, which is the normal
// case for the column and the one that must not become a crash.
//
// alpha carries a **non-default** `licence_expiry_warning_days`, and it is the only row that
// does. with the schema default 40 everywhere, a report that read the constant instead of
// the organisation's own column would answer every expiry status correctly and nothing could
// tell the two apart - bravo and charlie keep the default, which is the other half of that.
const organizations = [
  {
    key: 'alpha',
    name: 'Operator Alpha',
    reportToken: 'report-token-alpha',
    logoPath: 'organization-logos/alpha.png',
    expiryWarningDays: 60,
  },
  {
    key: 'bravo',
    name: 'Operator Bravo',
    reportToken: 'report-token-bravo',
    logoPath: null,
    expiryWarningDays: null,
  },

  // no airframes, no syllabus and nobody attached. the delete block is only a claim if
  // something also proves a delete still goes through when there is nothing to protect.
  {
    key: 'charlie',
    name: 'Operator Charlie',
    reportToken: 'report-token-charlie',
    logoPath: null,
    expiryWarningDays: null,
  },
] as const

// the certificate values are deliberately silly, and so are the contact ones. a
// plausible-looking number survives review; `CERT-PLACEHOLDER-…` and
// `PHONE-PLACEHOLDER-…` cannot be mistaken for a real pilot's, and `phone_number` is
// `text` so nothing forces a realistic value.
//
// one person carries a phone and a job title and the other three carry neither, so the
// workspace's people tabs have a subject for both the filled cell and the blank one.
const people = [
  {
    key: 'alphaManager',
    name: 'Alpha Manager',
    email: 'alpha.manager@example.invalid',
    certificate: null,
    phoneNumber: 'PHONE-PLACEHOLDER-0001',
    position: 'Placeholder Post',
  },
  {
    key: 'bravoManager',
    name: 'Bravo Manager',
    email: 'bravo.manager@example.invalid',
    certificate: null,
    phoneNumber: null,
    position: null,
  },

  // a pilot with no e-mail and no credentials. that is the normal case for the pilot
  // register, not an edge case, and a unique-not-null e-mail would make it impossible.
  // the one fixture holding certificates, so the register has something to print and the
  // three rows above keep proving the blank marker.
  {
    key: 'alphaPilot',
    name: 'Alpha Pilot',
    email: null,
    certificate: {
      number: 'CERT-PLACEHOLDER-0001',
      types: ['A1_A3', 'A2'],
      validUntil: '2027-06-30',
    },
    phoneNumber: null,
    position: null,
  },

  // the second alpha pilot, and the row the report's expiry window is measured against: the
  // certificate expires 47 days after the report's stated instant, which is inside alpha's
  // own 60-day window and outside the schema default of 40. a report reading the constant
  // answers `valid` here and one reading the organisation answers a warning, so the two are
  // distinguishable - which they are not on any other row.
  {
    key: 'alphaSecondPilot',
    name: 'Alpha Second Pilot',
    email: 'alpha.second.pilot@example.invalid',
    certificate: {
      number: 'CERT-PLACEHOLDER-0002',
      types: ['STS'],
      validUntil: '2026-10-01',
    },
    phoneNumber: null,
    position: null,
  },

  // the other operator's pilot, so "another operator's roster is absent" is an exclusion
  // rather than an empty list on both sides. the certificate has a number and **no expiry**,
  // which doc 03 records as *Bez expirácie* - a stated fact, and neither a warning nor a gap.
  {
    key: 'bravoPilot',
    name: 'Bravo Pilot',
    email: 'bravo.pilot@example.invalid',
    certificate: {
      number: 'CERT-PLACEHOLDER-0003',
      types: [],
      validUntil: null,
    },
    phoneNumber: null,
    position: null,
  },

  // the only cross-tenant reach there is. it comes from the system role and not from a
  // membership, so this one holds none.
  {
    key: 'systemAdmin',
    name: 'System Administrator',
    email: 'admin@example.invalid',
    certificate: null,
    phoneNumber: null,
    position: null,
  },
] as const

const airframes = [
  { key: 'alphaOne', organization: 'alpha', serialNumber: 'SN-ALPHA-0001', typed: true },
  // no device type: no VLOS limit and no service interval, which must read as a gap
  { key: 'alphaTwo', organization: 'alpha', serialNumber: 'SN-ALPHA-0002', typed: false },

  // the serviced airframe, and the one fixture row that carries **only** maintenance: no
  // training covers it and no flight names it, so the delete a maintenance record refuses is
  // unambiguously that record's doing. `alphaOne` could not hold this - a training already
  // restricts its delete, and tests/tenancy/training-isolation.test.ts names which
  // constraint refused. the serial skips 0003, which delete-authority inserts inline.
  { key: 'alphaServiced', organization: 'alpha', serialNumber: 'SN-ALPHA-0004', typed: true },
  { key: 'bravoOne', organization: 'bravo', serialNumber: 'SN-BRAVO-0001', typed: true },
] as const

// the maintenance history - docs/specs/03-data-model.md §"Maintenance log in the rebuild".
// alpha and bravo only, for the reason every register fixture here gives: charlie is deleted
// to prove the dependent block lifts, and `maintenance_log.organization_id` is `restrict`.
//
// the two alpha rows are one case between them, and it is the case the composed baseline
// exists for: the **newer** service states no cycle count and the older one does, so the
// calendar baseline and the cycle baseline have to come from different records. collapse
// them into one row and nothing can tell a composed baseline from a naive one.
//
// the technician names are obvious placeholders. `maintenance_performed_by` and
// `preflight_check_performed_by` hold real people in the predecessor, and a plausible-looking
// name survives review in a way `PLACEHOLDER-…` cannot.
//
// `total_flight_hours` is stated `h:mm` on two rows and with a decimal comma on the third.
// both are real inputs and the column is `text` so that neither is thrown away before R5
// parses it - a fixture carrying only one notation would not say so.
const maintenance = [
  {
    key: 'alphaFirstService',
    organization: 'alpha',
    airframe: 'alphaServiced',
    maintenanceDate: '2026-05-20',
    totalFlightHours: '41:30',
    totalFlights: 120,
    performedBy: 'PLACEHOLDER-TECHNICIAN-0001',
    description: 'Placeholder maintenance description.',
    preflightCheckBy: 'PLACEHOLDER-INSPECTOR-0001',
  },

  // the newest service on this airframe, and it states no cycle count. everything but the
  // date is a gap, which is the shape of a record filed in a hurry and is not an error.
  {
    key: 'alphaLatestService',
    organization: 'alpha',
    airframe: 'alphaServiced',
    maintenanceDate: '2026-07-05',
    totalFlightHours: '43,5',
    totalFlights: null,
    performedBy: null,
    description: null,
    preflightCheckBy: null,
  },
  {
    key: 'bravoService',
    organization: 'bravo',
    airframe: 'bravoOne',
    maintenanceDate: '2026-06-10',
    totalFlightHours: '12:15',
    totalFlights: 8,
    performedBy: 'PLACEHOLDER-TECHNICIAN-0002',
    description: 'Placeholder maintenance description.',
    preflightCheckBy: null,
  },
] as const

const trainingTypes = [
  { key: 'alphaInitial', organization: 'alpha', name: 'Alpha Initial Training', code: 'A1' },
  {
    key: 'alphaOperational',
    organization: 'alpha',
    name: 'Alpha Operational Training',
    code: 'OPS',
  },

  // the same code under the other operator. `code` is unique per organisation, never
  // deployment-wide, so this row is the fixture that pins that decision.
  { key: 'bravoInitial', organization: 'bravo', name: 'Bravo Initial Training', code: 'A1' },
] as const

// alpha and bravo only, never charlie: tests/tenancy/organization-isolation.test.ts deletes
// charlie to prove the dependent block lifts, and `training.organization_id` is `restrict`,
// so a training under charlie would turn that proof into a failure.
const trainings = [
  {
    key: 'alphaRecurrent',
    organization: 'alpha',
    name: 'Alpha Recurrent Training',
    trainingType: 'alphaInitial',
    pilot: 'alphaPilot',
    heldOn: '2026-03-01',
    validUntil: '2027-03-01',
    airframes: ['alphaOne'],
  },

  // no type, no date, no expiry and no airframe. the row that keeps the register honest
  // about the difference between a gap and a stated fact: a null `valid_until` reads as
  // *Bez expirácie*, a null `training_type_id` as the blank marker.
  {
    key: 'alphaOpen',
    organization: 'alpha',
    name: 'Alpha Unclassified Training',
    trainingType: null,
    pilot: 'alphaPilot',
    heldOn: null,
    validUntil: null,
    airframes: [],
  },
  {
    key: 'bravoRecurrent',
    organization: 'bravo',
    name: 'Bravo Recurrent Training',
    trainingType: 'bravoInitial',
    pilot: 'bravoManager',
    heldOn: '2026-04-01',
    validUntil: '2027-04-01',
    airframes: ['bravoOne'],
  },
] as const

// alpha and bravo only, for the reason the trainings above are: charlie is deleted to prove
// the dependent block lifts, and `flight.organization_id` is `restrict`.
//
// none of these names an airframe a training already covers. an airframe carrying both
// would leave two `restrict` constraints able to refuse the same delete, and the test that
// names which one refused would then be asserting an ordering Postgres never promised.
//
// every value is invented, filenames included: a real log name carries a controller serial
// and a date, and neither belongs in this repo. the dates are invented too, and chosen for
// what they make expressible: `importedAt` is the import instant and each leg states its own
// start, which is where the report derives a flight's date from -
// docs/specs/03-data-model.md §"Flights in the rebuild". a default `created_at` and legs
// with no start could express neither branch of that fallback.
const flights = [
  // imported in august and flown in july, which is the case the derivation exists for: a
  // report keyed on the import instant would file this flight under the wrong month
  {
    key: 'alphaImported',
    organization: 'alpha',
    fileName: 'placeholder-flight-0001.txt',
    entryMode: 'dji_log',
    pilot: 'alphaPilot',
    airframe: 'alphaTwo',
    importedBy: 'alphaManager',
    parsingStatus: 'processed',
    parsingErrors: null,
    totalFlightTimeSeconds: 5100,
    maxAltitudeMeters: '95.5',
    maxDistanceMeters: '420.25',
    totalDistanceMeters: '1830.75',
    importedAt: '2026-08-03T08:00:00Z',
    legs: ['2026-07-14T09:00:00Z', '2026-07-14T11:30:00Z'],
  },

  // no pilot, no airframe and nobody named as the importer. that is the normal state of a
  // synced flight - automated ingest cannot know who was flying - and it is the row the
  // register most has to keep visible.
  {
    key: 'alphaUnassigned',
    organization: 'alpha',
    fileName: 'placeholder-flight-0002.txt',
    entryMode: 'controller_sync',
    pilot: null,
    airframe: null,
    importedBy: null,
    parsingStatus: 'processed',
    parsingErrors: null,
    totalFlightTimeSeconds: 2400,
    maxAltitudeMeters: '48',
    maxDistanceMeters: '110',
    totalDistanceMeters: '640',
    importedAt: '2026-08-05T09:00:00Z',

    // its one leg states no start. the fallback keys on there being no earliest start and
    // not on there being no legs, and this is the row that tells those two readings apart.
    legs: [null],
  },

  // the parse failed, so there are no legs and no measurements - and the row is retained,
  // because it is still evidence that a flight happened
  {
    key: 'alphaFailed',
    organization: 'alpha',
    fileName: 'placeholder-flight-0003.txt',
    entryMode: 'dji_log',
    pilot: null,
    airframe: null,
    importedBy: 'alphaManager',
    parsingStatus: 'failed',
    parsingErrors: 'Placeholder parse failure.',
    totalFlightTimeSeconds: null,
    maxAltitudeMeters: null,
    maxDistanceMeters: null,
    totalDistanceMeters: null,
    importedAt: '2026-08-06T10:00:00Z',
    legs: [],
  },

  // manually entered, so nothing was parsed and the status is null rather than a state
  // invented to fill it
  {
    key: 'bravoManual',
    organization: 'bravo',
    fileName: 'placeholder-flight-0004',
    entryMode: 'manual',
    pilot: 'bravoManager',
    airframe: 'bravoOne',
    importedBy: 'bravoManager',
    parsingStatus: null,
    parsingErrors: null,
    totalFlightTimeSeconds: 2700,
    maxAltitudeMeters: '60',
    maxDistanceMeters: '250',
    totalDistanceMeters: '900',
    importedAt: '2026-08-07T11:00:00Z',
    legs: [],
  },
] as const

// the document library and the buckets beside it. `organization: null` is the global
// library - the only nullable `organization_id` in the schema - and the CHECK constraint is
// what keeps the pair honest, so every row here states both halves and none of them may
// disagree.
//
// nothing under charlie, for the reason the trainings and the flights above give: charlie is
// deleted to prove the dependent block lifts, and `document.organization_id` is `restrict`.
//
// alphaManager uploads nothing on purpose. `uploaded_by` is `restrict`, and
// tests/tenancy/flight-isolation.test.ts asserts *which* constraint refuses a delete of that
// person - a second one on the same row would leave the answer to Postgres's ordering.
//
// two of these name a file that is actually on disk - the global manual and the alpha
// permit, which are the global library's half and an operator's half of the one file route.
// the rest are the rows that prove a stored path pointing at nothing is a gap and never a
// crash.
//
// all four categories appear, and every one of doc 05's three workspace tabs has an alpha row
// to list: the buckets partition this table, and a fixture set missing one of them could not
// tell a tab reading its own bucket from a tab reading them all.
const documents = [
  {
    key: 'globalManual',
    organization: null,
    category: 'general',
    name: 'Placeholder Operations Manual Template',
    filePath: 'general-documents/placeholder-operations-manual.pdf',
    note: 'Placeholder template note.',
    validUntil: null,
    isPublic: false,
    uploadedBy: 'systemAdmin',
    size: 12800,
  },

  // nobody named as the uploader, no size and an expiry that is stated. between them and the
  // row above, both halves of every cell the register can leave blank are covered.
  {
    key: 'globalForm',
    organization: null,
    category: 'general',
    name: 'Placeholder Reporting Form Template',
    filePath: 'general-documents/placeholder-reporting-form.docx',
    note: null,
    validUntil: '2027-12-31',
    isPublic: false,
    uploadedBy: null,
    size: null,
  },
  {
    key: 'alphaOperations',
    organization: 'alpha',
    category: 'operations',
    name: 'Alpha Operations Manual',
    filePath: 'operations-documents/placeholder-alpha-manual.pdf',
    note: null,
    validUntil: '2027-06-30',
    isPublic: false,
    uploadedBy: 'alphaPilot',
    size: 2400000,
  },

  // doc 05 §3's tab, with both of its gaps on one row: nobody named as the uploader and no
  // size recorded. `Nahral` blank is the *normal* row for the global library and is not
  // normal here, which is what makes it worth seeding on a tenant-owned bucket.
  {
    key: 'alphaForm',
    organization: 'alpha',
    category: 'forms',
    name: 'Alpha Occurrence Form',
    filePath: 'forms/placeholder-alpha-form.pdf',
    note: null,
    validUntil: null,
    isPublic: false,
    uploadedBy: null,
    size: null,
  },

  // the public permit, and the only tenant-owned row naming a file on disk: an operator's own
  // bytes reached through the one file route are what #75 consolidated, and a fixture pointing
  // at nothing could not tell that route working from that route refusing.
  //
  // `is_public` is set here and read by no handler. doc 05 §4's tab shows the flag; whether a
  // public permit is exposed without a session is doc 06's to settle.
  {
    key: 'alphaPermit',
    organization: 'alpha',
    category: 'permits',
    name: 'placeholder-alpha-permit.pdf',
    filePath: 'permits/placeholder-alpha-permit.pdf',
    note: null,
    validUntil: '2027-09-30',
    isPublic: true,
    uploadedBy: 'alphaPilot',
    size: 51200,
  },

  // and the permit nobody ticked, so the column has a row that must *not* read as public
  {
    key: 'alphaPrivatePermit',
    organization: 'alpha',
    category: 'permits',
    name: 'placeholder-alpha-restricted.pdf',
    filePath: 'permits/placeholder-alpha-restricted.pdf',
    note: null,
    validUntil: null,
    isPublic: false,
    uploadedBy: 'alphaPilot',
    size: 8192,
  },
  {
    key: 'bravoForm',
    organization: 'bravo',
    category: 'forms',
    name: 'Bravo Occurrence Form',
    filePath: 'forms/placeholder-bravo-form.pdf',
    note: null,
    validUntil: null,
    isPublic: false,
    uploadedBy: 'bravoManager',
    size: 4096,
  },
] as const

// the occurrence register - docs/specs/05-organization-workspace.md §6. alpha and bravo
// only, for the reason the trainings, the flights and the documents above give: charlie is
// deleted to prove the dependent block lifts, and `incident.organization_id` is `restrict`.
//
// **three alpha rows and not one**, because `injuries` is the schema's only nullable boolean
// and its three states are three different cells - yes, an answered no, and nobody answered.
// drop any one of them and the other two stop being distinguishable from each other.
//
// one names a flight and the rest name none. a null `flight_id` is the case doc 05 §6 calls
// *optional* and `MATCH SIMPLE` keeps writable, so it is the normal row rather than an edge.
// the linked one names `alphaFailed` and deliberately not `alphaImported`, which
// tests/tenancy/flight-isolation.test.ts deletes to prove its legs cascade - a `restrict`
// from here would turn that proof into a failure, the same collision the flights above avoid
// with the airframes the trainings cover.
//
// one file on disk and two rows carrying none: `incident.file_path` is nullable where
// `document.file_path` is not, so a report attached to no file at all is a state this
// register has to survive rather than an omission.
const incidents = [
  {
    key: 'alphaInjury',
    organization: 'alpha',
    title: 'Placeholder Occurrence With Injury',
    description: 'Placeholder occurrence description.',
    incidentDate: '2026-05-14',
    flight: 'alphaFailed',
    injuries: true,
    notes: 'Placeholder occurrence note.',
    filePath: 'incidents/placeholder-alpha-incident.pdf',
  },
  {
    key: 'alphaNoInjury',
    organization: 'alpha',
    title: 'Placeholder Occurrence Without Injury',
    description: 'Placeholder occurrence description.',
    incidentDate: '2026-06-02',
    flight: null,
    injuries: false,
    notes: null,
    filePath: null,
  },

  // nobody answered the injury question, which is not the same fact as answering no
  {
    key: 'alphaUnanswered',
    organization: 'alpha',
    title: 'Placeholder Occurrence Unanswered',
    description: 'Placeholder occurrence description.',
    incidentDate: '2026-06-19',
    flight: null,
    injuries: null,
    notes: null,
    filePath: null,
  },
  {
    key: 'bravoReport',
    organization: 'bravo',
    title: 'Placeholder Bravo Occurrence',
    description: 'Placeholder occurrence description.',
    incidentDate: '2026-07-08',
    flight: null,
    injuries: false,
    notes: null,
    filePath: null,
  },
] as const

// the geozone maps. every value is invented, the slugs included: the predecessor's own
// slugs live in contracts/routes.json as capture and are never reseeded here as if they
// were ours.
//
// the two rows carry the whole of what makes this register unlike its siblings. the first
// is assigned to both operators, so a member reading it must see their own assignment and
// not the other's - the disclosure the pivot's tenant-scoped read exists to prevent. the
// second is assigned to **nobody** and has no layers, and every session still reads it:
// the assignment decides which tenants see a map in their report, never who may read the
// map, and a map with no layers counts none rather than reading blank.
const maps = [
  {
    key: 'shared',
    name: 'Placeholder Geozones',
    slug: 'placeholder-geozones',
    allowDarkBasemap: true,
    organizations: ['alpha', 'bravo'],
    // one typed layer and one untyped. *no type* is the absence of a classification, so it
    // is a null here and never a seventh enum value.
    layers: [
      {
        displayName: 'Placeholder Restricted Area',
        layerType: 'lzr',
        filePath: 'map-layers/placeholder-restricted-area.kml',
      },
      {
        displayName: 'Placeholder Untyped Layer',
        layerType: null,
        filePath: 'map-layers/placeholder-untyped-layer.kml',
      },
    ],
  },
  {
    key: 'unassigned',
    name: 'Placeholder Empty Map',
    slug: 'placeholder-empty-map',
    allowDarkBasemap: false,
    organizations: [],
    layers: [],
  },
] as const

export type OrganizationKey = (typeof organizations)[number]['key']
export type PersonKey = (typeof people)[number]['key']
export type AirframeKey = (typeof airframes)[number]['key']
export type MaintenanceKey = (typeof maintenance)[number]['key']
export type TrainingTypeKey = (typeof trainingTypes)[number]['key']
export type TrainingKey = (typeof trainings)[number]['key']
export type FlightKey = (typeof flights)[number]['key']
export type DocumentKey = (typeof documents)[number]['key']
export type IncidentKey = (typeof incidents)[number]['key']
export type MapKey = (typeof maps)[number]['key']

export type SeededIds = {
  organizations: Record<OrganizationKey, number>
  people: Record<PersonKey, number>
  airframes: Record<AirframeKey, number>
  maintenance: Record<MaintenanceKey, number>
  trainingTypes: Record<TrainingTypeKey, number>
  trainings: Record<TrainingKey, number>
  flights: Record<FlightKey, number>
  documents: Record<DocumentKey, number>
  incidents: Record<IncidentKey, number>
  maps: Record<MapKey, number>
  deviceType: number
}

async function insertOne<T extends { id: number }>(inserted: Promise<T[]>): Promise<number> {
  const [row] = await inserted
  if (!row) throw new Error('fixture row was not inserted')
  return row.id
}

// seeded through a connection that is exempt from row-level security, because the
// policies deny a write from a session with no tenant context - which is the correct
// behaviour, and makes seeding a deployment concern rather than an application one.
export async function seedFixtures(db: Database): Promise<SeededIds> {
  const organizationIds = {} as Record<OrganizationKey, number>
  for (const entry of organizations) {
    organizationIds[entry.key] = await insertOne(
      db
        .insert(organization)
        .values({
          name: entry.name,
          reportToken: entry.reportToken,
          logoPath: entry.logoPath,

          // undefined and not a literal, so the two rows without one take the column's own
          // default rather than a copy of it stated here
          licenceExpiryWarningDays: entry.expiryWarningDays ?? undefined,
        })
        .returning({ id: organization.id }),
    )
  }

  const personIds = {} as Record<PersonKey, number>
  for (const entry of people) {
    personIds[entry.key] = await insertOne(
      db
        .insert(person)
        .values({
          name: entry.name,
          email: entry.email,
          systemRole: entry.key === 'systemAdmin' ? 'superadmin' : 'member',
          certificateNumber: entry.certificate?.number ?? null,
          certificateTypes: entry.certificate ? [...entry.certificate.types] : [],
          certificateValidUntil: entry.certificate?.validUntil ?? null,
          phoneNumber: entry.phoneNumber,
          position: entry.position,
        })
        .returning({ id: person.id }),
    )
  }

  await db.insert(membership).values([
    {
      personId: personIds.alphaManager,
      organizationId: organizationIds.alpha,
      role: 'accountable_manager',
      isPrimaryContact: true,
    },
    { personId: personIds.alphaPilot, organizationId: organizationIds.alpha, role: 'pilot' },
    { personId: personIds.alphaSecondPilot, organizationId: organizationIds.alpha, role: 'pilot' },
    {
      personId: personIds.bravoManager,
      organizationId: organizationIds.bravo,
      role: 'accountable_manager',
      isPrimaryContact: true,
    },

    // bravo's only pilot. its manager flies and is *not* one, which is what lets the report
    // suite assert that the roster and `active_pilots` legitimately disagree.
    { personId: personIds.bravoPilot, organizationId: organizationIds.bravo, role: 'pilot' },
  ])

  const deviceTypeId = await insertOne(
    db
      .insert(deviceType)
      .values({
        name: 'Placeholder Quadcopter',
        maxVlos: '500',
        serviceInterval: 50,
        serviceIntervalMonths: 12,
        batteryServiceInterval: 100,
        maintenanceInstructions: 'Placeholder maintenance instructions.',
      })
      .returning({ id: deviceType.id }),
  )

  const airframeIds = {} as Record<AirframeKey, number>
  for (const entry of airframes) {
    airframeIds[entry.key] = await insertOne(
      db
        .insert(device)
        .values({
          organizationId: organizationIds[entry.organization],
          serialNumber: entry.serialNumber,
          deviceTypeId: entry.typed ? deviceTypeId : null,
        })
        .returning({ id: device.id }),
    )
  }

  const maintenanceIds = {} as Record<MaintenanceKey, number>
  for (const entry of maintenance) {
    maintenanceIds[entry.key] = await insertOne(
      db
        .insert(maintenanceLog)
        .values({
          organizationId: organizationIds[entry.organization],
          deviceId: airframeIds[entry.airframe],
          maintenanceDate: entry.maintenanceDate,
          totalFlightHours: entry.totalFlightHours,
          totalFlights: entry.totalFlights,
          maintenancePerformedBy: entry.performedBy,
          faultAndMaintenanceDescription: entry.description,
          preflightCheckPerformedBy: entry.preflightCheckBy,
        })
        .returning({ id: maintenanceLog.id }),
    )
  }

  const trainingTypeIds = {} as Record<TrainingTypeKey, number>
  for (const entry of trainingTypes) {
    trainingTypeIds[entry.key] = await insertOne(
      db
        .insert(trainingType)
        .values({
          organizationId: organizationIds[entry.organization],
          name: entry.name,
          code: entry.code,
        })
        .returning({ id: trainingType.id }),
    )
  }

  const trainingIds = {} as Record<TrainingKey, number>
  for (const entry of trainings) {
    const organizationId = organizationIds[entry.organization]
    trainingIds[entry.key] = await insertOne(
      db
        .insert(training)
        .values({
          organizationId,
          name: entry.name,
          trainingTypeId: entry.trainingType ? trainingTypeIds[entry.trainingType] : null,
          pilotId: personIds[entry.pilot],
          heldOn: entry.heldOn,
          validUntil: entry.validUntil,
        })
        .returning({ id: training.id }),
    )

    // the pivot carries the tenant itself rather than reaching the training for it, so the
    // seed states it here too - and the composite foreign key is what stops it drifting
    for (const airframe of entry.airframes) {
      await db.insert(trainingDevice).values({
        trainingId: trainingIds[entry.key],
        deviceId: airframeIds[airframe],
        organizationId,
      })
    }
  }

  const flightIds = {} as Record<FlightKey, number>
  for (const entry of flights) {
    const organizationId = organizationIds[entry.organization]
    flightIds[entry.key] = await insertOne(
      db
        .insert(flight)
        .values({
          organizationId,
          fileName: entry.fileName,
          entryMode: entry.entryMode,
          pilotId: entry.pilot ? personIds[entry.pilot] : null,
          deviceId: entry.airframe ? airframeIds[entry.airframe] : null,
          importedBy: entry.importedBy ? personIds[entry.importedBy] : null,
          parsingStatus: entry.parsingStatus,
          parsingErrors: entry.parsingErrors,
          totalFlightTimeSeconds: entry.totalFlightTimeSeconds,
          maxAltitudeMeters: entry.maxAltitudeMeters,
          maxDistanceMeters: entry.maxDistanceMeters,
          totalDistanceMeters: entry.totalDistanceMeters,
          createdAt: new Date(entry.importedAt),
        })
        .returning({ id: flight.id }),
    )

    // the legs carry the tenant themselves rather than reaching the flight for it, the way
    // the training pivot does - and the composite foreign key is what stops it drifting
    for (const startedAt of entry.legs) {
      await db.insert(flightLog).values({
        flightId: flightIds[entry.key],
        organizationId,
        startedAt: startedAt === null ? null : new Date(startedAt),
        durationSeconds: 600,
        distanceMeters: '300',
        maxAltitudeMeters: '45',
        aircraft: 'Placeholder Quadcopter',
      })
    }
  }

  const documentIds = {} as Record<DocumentKey, number>
  for (const entry of documents) {
    documentIds[entry.key] = await insertOne(
      db
        .insert(document)
        .values({
          organizationId: entry.organization ? organizationIds[entry.organization] : null,
          category: entry.category,
          name: entry.name,
          filePath: entry.filePath,
          note: entry.note,
          validUntil: entry.validUntil,
          isPublic: entry.isPublic,
          uploadedBy: entry.uploadedBy ? personIds[entry.uploadedBy] : null,
          size: entry.size,
        })
        .returning({ id: document.id }),
    )
  }

  const incidentIds = {} as Record<IncidentKey, number>
  for (const entry of incidents) {
    incidentIds[entry.key] = await insertOne(
      db
        .insert(incident)
        .values({
          organizationId: organizationIds[entry.organization],
          title: entry.title,
          description: entry.description,
          incidentDate: entry.incidentDate,
          flightId: entry.flight ? flightIds[entry.flight] : null,
          injuries: entry.injuries,
          notes: entry.notes,
          filePath: entry.filePath,
        })
        .returning({ id: incident.id }),
    )
  }

  const mapIds = {} as Record<MapKey, number>
  for (const entry of maps) {
    mapIds[entry.key] = await insertOne(
      db
        .insert(map)
        .values({
          name: entry.name,
          slug: entry.slug,
          allowDarkBasemap: entry.allowDarkBasemap,
        })
        .returning({ id: map.id }),
    )

    for (const key of entry.organizations) {
      await db
        .insert(mapOrganization)
        .values({ mapId: mapIds[entry.key], organizationId: organizationIds[key] })
    }

    for (const layer of entry.layers) {
      await db.insert(mapKmlFile).values({
        mapId: mapIds[entry.key],
        filePath: layer.filePath,
        displayName: layer.displayName,
        layerType: layer.layerType,
      })
    }
  }

  return {
    organizations: organizationIds,
    people: personIds,
    airframes: airframeIds,
    maintenance: maintenanceIds,
    trainingTypes: trainingTypeIds,
    trainings: trainingIds,
    flights: flightIds,
    documents: documentIds,
    incidents: incidentIds,
    maps: mapIds,
    deviceType: deviceTypeId,
  }
}
