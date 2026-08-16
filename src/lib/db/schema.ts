import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// identifiers keep the data model's spelling (`organization`), prose keeps CONTEXT.md's
// (`organisation`). renaming the column would only add a translation step to the
// history migration that is still coming.

// the acting session, set transaction-locally by withTenant() in
// src/lib/tenant/tenant-context.ts. `true` on current_setting means "null if unset"
// rather than an error, so a connection with no tenant context reads as nobody and
// every policy below denies - which is the safe direction.
const actingPerson = sql`nullif(current_setting('app.person_id', true), '')::integer`
const actingIsSuperadmin = sql`coalesce(current_setting('app.system_role', true) = 'superadmin', false)`

// the organisations the acting person holds a membership of. keyed off membership,
// never off a column on the person - docs/specs/03-data-model.md §"Membership in the
// rebuild".
//
// the read goes through app_acting_organizations(), a SECURITY DEFINER function defined
// in drizzle/0005_shared_organization_policy.sql, so it answers outside row-level
// security. inlining the query here instead would make every policy below read
// membership under membership's own policy - and that policy now asks this same
// question, which is a recursion.
const actingOrganizations = sql`select app_acting_organizations()`

export const systemRole = pgEnum('system_role', ['superadmin', 'member'])
export const organizationRole = pgEnum('organization_role', [
  'accountable_manager',
  'operations',
  'pilot',
  'viewer',
])
export const operationType = pgEnum('operation_type', ['VLOS', 'BVLOS'])

// the closed EASA set of pilot competency certificates - CONTEXT.md §"Regulatory frame".
// an enum and not a table, on the same tenant-owned/deployment-wide judgement device_type
// records: doc 04 lists thirteen resources and none administers this set, so it is not an
// operator's own record and a pivot would buy a second tier-3 policy for nothing -
// docs/specs/03-data-model.md §"Certificates in the rebuild".
export const certificateType = pgEnum('certificate_type', ['A1_A3', 'A2', 'STS'])
export const deviceStatus = pgEnum('device_status', ['active', 'inactive', 'maintenance', 'retired'])

// which import path created a flight - docs/specs/07-flight-ingestion.md. four and not
// three: the doc's `upload_mode` discriminator has three values, but the controller sync
// does not go through that endpoint and still produces a flight, so three would leave a
// synced flight with no entry mode to carry. the enum describes the data model rather than
// what the write path can currently reach, and today it can reach none of them.
export const entryMode = pgEnum('entry_mode', [
  'dji_log',
  'agro_export',
  'manual',
  'controller_sync',
])

// the outcome of parsing a source file. the membership here is the rebuild's own decision
// and not a recovered fact - doc 03 gives one value by example and doc 07's four-valued
// list belongs to `MobileLogUpload`, a different entity. minimal on purpose: a pending
// state joins it when the parsers land (#6) and have something to be pending about.
export const parsingStatus = pgEnum('parsing_status', ['processed', 'failed'])

// the tenant. `logo_path` holds where the file lives, never the bytes -
// docs/specs/03-data-model.md §"Organisation deletion and the logo in the rebuild".
// deleting one is blocked while dependents exist, and the block is the `restrict` on the
// dependent foreign keys below rather than a check a second call path could skip.
export const organization = pgTable(
  'organization',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    logoPath: text('logo_path'),
    uasRegistrationNumber: text('uas_registration_number'),
    specificPermitNumber: text('specific_permit_number'),
    specificOperationType: operationType('specific_operation_type'),
    maxAllowedAltitude: numeric('max_allowed_altitude'),
    insuranceValidUntil: date('insurance_valid_until'),
    licenceExpiryWarningDays: integer('licence_expiry_warning_days').notNull().default(40),
    reportToken: text('report_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_report_token_key').on(table.reportToken),
    pgPolicy('organization_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.id} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin}`,
    }),

    // DELETE has no WITH CHECK in Postgres - USING alone decides it - so the narrowing
    // above covers inserts and updates and leaves deletion at the tenant predicate.
    // restrictive, because permissive policies OR together and a narrower permissive one
    // beside the policy above would restrict nothing. docs/specs/03-data-model.md
    // §"Delete authority in the rebuild".
    pgPolicy('organization_delete_superadmin_only', {
      as: 'restrictive',
      for: 'delete',
      using: actingIsSuperadmin,
    }),
  ],
)

// a person is a subject of flight records first and a login second. `email` is nullable
// and load-bearing: a pilot may exist with no e-mail and no credentials, so uniqueness
// is conditional and credentials live in the auth tables below, never here.
export const person = pgTable(
  'person',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email'),
    systemRole: systemRole('system_role').notNull().default('member'),

    // the *Osvedčenia* section of doc 04 §UserResource. certificate, never licence -
    // CONTEXT.md §"Certification & training"; contracts/forms/users.json keeps the
    // predecessor's three spellings and is never edited.
    //
    // an empty `certificate_types` means no certificate type is recorded, which is a gap
    // and never a pass - the same rule as an airframe with no device type.
    certificateNumber: text('certificate_number'),
    certificateTypes: certificateType('certificate_types')
      .array()
      .notNull()
      .default(sql`'{}'`),
    certificateValidUntil: date('certificate_valid_until'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('person_email_key').on(table.email).where(sql`${table.email} is not null`),

    // the people you share an organisation with, plus yourself - docs/specs/03-data-model.md
    // §"The shared-organisation read in the rebuild". not named `tenant_isolation` like its
    // siblings, because a person carries no organisation column and never will.
    //
    // the organisation predicate is stated here rather than inherited from membership's
    // policy, which now ands the same condition on. redundant on purpose, and the spec
    // section says why.
    pgPolicy('person_shared_organization_or_self', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.id} = ${actingPerson}
        or exists (select 1 from public.membership m
                   where m.person_id = ${table.id}
                     and m.organization_id in (${actingOrganizations}))`,
      withCheck: sql`${actingIsSuperadmin}`,
    }),

    // and self does not extend to deleting self: a person row is the subject a flight
    // history hangs off, and accounts are administered rather than self-served -
    // docs/specs/03-data-model.md §"Delete authority in the rebuild".
    pgPolicy('person_delete_superadmin_only', {
      as: 'restrictive',
      for: 'delete',
      using: actingIsSuperadmin,
    }),
  ],
)

// the attachment of a person to an organisation. detach is a delete of this row and
// nothing else - the person and their flight history survive it.
//
// `organization_id` stays cascade where the two below are restrict: dissolving an
// organisation detaches its people and every person survives it, which is the same rule
// read from the other end. a membership is not airworthiness evidence.
export const membership = pgTable(
  'membership',
  {
    id: serial('id').primaryKey(),
    personId: integer('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: organizationRole('role').notNull(),
    isPrimaryContact: boolean('is_primary_contact').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('membership_person_organization_key').on(table.personId, table.organizationId),
    index('membership_organization_idx').on(table.organizationId),

    // every attachment to an organisation the acting person belongs to, shaped like the
    // three tenant_isolation policies beside it. the register's `Organizácia` and `Roly`
    // columns are membership rows, so a policy that admitted only your own would leave two
    // of them unrenderable - and moving that read into application code is the
    // per-controller scoping docs/specs/09-roles-permissions.md §Multi-tenancy forbids.
    //
    // widening it gives up nothing the narrow one was protecting: the function above
    // returns the acting person's own organisations and no others, so one operator still
    // cannot enumerate another's staff.
    pgPolicy('membership_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin}`,
    }),

    // detaching yourself is a delete of this row, and only a superadmin may attach one -
    // so a member deleting one is asymmetric in the dangerous direction. awaiting the
    // people-and-memberships register rather than settled: docs/specs/03-data-model.md
    // §"Delete authority in the rebuild".
    pgPolicy('membership_delete_superadmin_only', {
      as: 'restrictive',
      for: 'delete',
      using: actingIsSuperadmin,
    }),
  ],
)

// the airframe catalogue. deployment-wide and maintained by superadmin, so it carries
// no organisation column and no policy - docs/specs/03-data-model.md §"Device types in
// the rebuild". the missing tenant binding is the decision, not an oversight; the
// tenant-scoped entity in this chain is the airframe below.
export const deviceType = pgTable('device_type', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  maxVlos: numeric('max_vlos'),
  serviceInterval: integer('service_interval'),
  serviceIntervalMonths: integer('service_interval_months'),
  batteryServiceInterval: integer('battery_service_interval'),
  maintenanceInstructions: text('maintenance_instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// one airframe. `device_type_id` is nullable because "no type assigned" is a real and
// common state - it leaves the airframe with no VLOS limit and no service interval,
// which src/lib/devices/service-schedule.ts reports as a gap and never as a pass.
//
// `organization_id` is `restrict`: an airframe carries maintenance history and the
// flights flown on it, so cascading a tenant delete through here destroys the
// airworthiness record. the database refuses instead.
export const device = pgTable(
  'device',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    serialNumber: text('serial_number').notNull(),
    name: text('name'),
    model: text('model'),
    manufacturer: text('manufacturer'),
    deviceTypeId: integer('device_type_id').references(() => deviceType.id, {
      onDelete: 'set null',
    }),
    status: deviceStatus('status').notNull().default('active'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('device_organization_idx').on(table.organizationId),

    // redundant beside the primary key, and that is the point: it exists to be referenced.
    // `training_device` carries `organization_id` into this pair, so a pivot row naming
    // another operator's airframe is rejected by the foreign key rather than merely hidden
    // from a read - docs/specs/03-data-model.md §"Trainings in the rebuild". a table
    // constraint and not a `uniqueIndex()` like the ones above, because that is the
    // unambiguously legal target of a composite foreign key.
    unique('device_id_organization_key').on(table.id, table.organizationId),

    // no restrictive delete policy beside this one, unlike organization/person/membership:
    // a fleet is the operator's own record and deleting an airframe is the same authority
    // as writing one - docs/specs/03-data-model.md §"Delete authority in the rebuild".
    // that holds only while an airframe carries no history. `training_device` was the first
    // dependent to restrict on that reasoning and `flight` below is the second, so an
    // airframe that flew cannot be deleted out from under the record. `maintenance_log`
    // must do the same when it lands, or a member deletes the evidence with the row.
    pgPolicy('device_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
    }),
  ],
)

// the training taxonomy an operator holds. tenant-owned, unlike the catalogue above -
// docs/specs/03-data-model.md §"Training types in the rebuild". a syllabus entry is an
// operator's own record, so `code` is unique per organisation and two operators may both
// hold `A1`. `organization_id` is `restrict` for the same reason the airframe's is: a
// tenant delete has to be a deliberate act against an emptied organisation, not a sweep
// that takes the syllabus with it.
export const trainingType = pgTable(
  'training_type',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('training_type_organization_code_key').on(table.organizationId, table.code),
    index('training_type_organization_idx').on(table.organizationId),

    // the same referenceable pair as the airframe's, for the same reason: `training`
    // carries `organization_id` into it, so a training classified by another operator's
    // syllabus entry cannot be written at all.
    unique('training_type_id_organization_key').on(table.id, table.organizationId),

    // shaped like device_tenant_isolation, and tenant-scoped on withCheck as well rather
    // than superadmin-only: a member maintains their own syllabus. deleting a syllabus
    // entry is that same authority, so this one keeps its tenant-scoped delete by decision
    // and not by coincidence - docs/specs/03-data-model.md §"Delete authority in the
    // rebuild".
    pgPolicy('training_type_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
    }),
  ],
)

// a training held by a pilot, optionally scoped to airframes - docs/specs/03-data-model.md
// §"Trainings in the rebuild". the first row in the rebuild that reaches across two other
// tenant-owned tables, and both reaches are closed by the schema rather than by a policy.
//
// `held_on` and `valid_until` are the rebuild's names for the contract's `date_start` and
// `date_end`; the wire names stay the contract's in src/lib/trainings/fields.ts. a null
// `valid_until` means the training never expires, which is a state and never an expiry that
// has passed.
//
// `training_type_id` is nullable and `pilot_id` is not: doc 04 marks the pilot required and
// the type not. both restrict on delete - which syllabus entry classified a training is
// part of the competency record, so `device.device_type_id`'s `set null` is deliberately
// not followed here.
export const training = pgTable(
  'training',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),

    // no `references()` on these two: the tenant travels with them, in the composite
    // foreign key below
    trainingTypeId: integer('training_type_id'),
    pilotId: integer('pilot_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    heldOn: date('held_on'),
    validUntil: date('valid_until'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('training_organization_idx').on(table.organizationId),
    unique('training_id_organization_key').on(table.id, table.organizationId),

    // the tenant boundary as a foreign key. a plain references(trainingType.id) would let
    // this row point at another operator's syllabus entry and no policy would notice,
    // because the row's own `organization_id` would be perfectly correct. carrying the
    // column into the reference makes the cross-tenant row unwritable instead.
    //
    // MATCH SIMPLE is the default and is what is wanted: `training_type_id` is nullable,
    // and a null there leaves the constraint unenforced rather than failing.
    foreignKey({
      columns: [table.trainingTypeId, table.organizationId],
      foreignColumns: [trainingType.id, trainingType.organizationId],
      name: 'training_training_type_id_organization_id_fk',
    }).onDelete('restrict'),

    // `pilot_id` gets no such treatment, because `person` carries no organisation column
    // and never will. what keeps a cross-tenant pilot out is
    // `person_shared_organization_or_self` at read time and the test beside it.
    pgPolicy('training_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
    }),
  ],
)

// which airframes a training covered. `organization_id` is carried rather than reached
// through `training` in a policy subquery: a policy depending on a neighbour's policy to
// be correct is the coupling that breaks silently when one of the two is narrowed alone,
// and the composite foreign keys below make this denormalisation unable to drift.
//
// so it needs no direct foreign key to `organization` - the reference into
// `training (id, organization_id)` already forces the column to be a real training's
// tenant, and that training's own `organization_id` is a foreign key to `organization`.
export const trainingDevice = pgTable(
  'training_device',
  {
    id: serial('id').primaryKey(),
    trainingId: integer('training_id').notNull(),
    deviceId: integer('device_id').notNull(),
    organizationId: integer('organization_id').notNull(),
  },
  (table) => [
    uniqueIndex('training_device_training_device_key').on(table.trainingId, table.deviceId),
    index('training_device_organization_idx').on(table.organizationId),

    // both ends are provably the same tenant as the row, which is the whole reason this
    // table carries `organization_id` at all
    foreignKey({
      columns: [table.trainingId, table.organizationId],
      foreignColumns: [training.id, training.organizationId],
      name: 'training_device_training_id_organization_id_fk',
    }).onDelete('cascade'),

    // cascade from the training above, restrict from the airframe here. detaching an
    // airframe from a training is not evidence in itself, so the pivot row goes with the
    // training - but a training that says it covered an airframe is exactly the history
    // the airframe's own comment says a dependent must refuse to let a member delete
    // through.
    foreignKey({
      columns: [table.deviceId, table.organizationId],
      foreignColumns: [device.id, device.organizationId],
      name: 'training_device_device_id_organization_id_fk',
    }).onDelete('restrict'),

    pgPolicy('training_device_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
    }),
  ],
)

// one recorded flight, and the airworthiness record itself - docs/specs/03-data-model.md
// §"Flights in the rebuild". `organization_id` is `restrict` for the reason the airframe's
// is, only harder: a tenant delete must be a deliberate act against an emptied
// organisation, never a sweep that takes the flight history with it.
//
// `pilot_id` and `device_id` are both nullable and stay that way. a flight with neither is
// normal - automated ingest cannot know who was flying, and assignment is a later step -
// so nothing here may make it a creation-time requirement and no read may hide it.
//
// `parsing_status` and `parsing_errors` exist from the first migration though nothing
// parses yet, because the register has to be built around the fact that they can be set: a
// failed parse is still a record, and dropping it loses the evidence that a flight
// happened. a null status is the manual-entry case, where there was no file to parse.
export const flight = pgTable(
  'flight',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),

    // no `references()`: the tenant travels with the airframe, in the composite foreign key
    // below
    deviceId: integer('device_id'),

    // both plain references to `person`, which carries no organisation column and never
    // will - the same footing `training.pilot_id` has. `restrict` on each, so neither the
    // pilot who flew nor the person who imported the record can be deleted out from under
    // it. `imported_by` is nullable because a controller sync has no person to name.
    pilotId: integer('pilot_id').references(() => person.id, { onDelete: 'restrict' }),
    importedBy: integer('imported_by').references(() => person.id, { onDelete: 'restrict' }),

    // the source log filename, and the flight's display name - doc 03 §Flight
    fileName: text('file_name'),
    entryMode: entryMode('entry_mode').notNull(),
    totalFlightTimeSeconds: integer('total_flight_time_seconds'),
    maxAltitudeMeters: numeric('max_altitude_meters'),

    // maximum distance from the pilot, which is the figure the VLOS check is judged on -
    // and a different quantity from the track length below. doc 03's field table was
    // missing it; §"Flights in the rebuild" records what settled that.
    maxDistanceMeters: numeric('max_distance_meters'),
    totalDistanceMeters: numeric('total_distance_meters'),
    parsingStatus: parsingStatus('parsing_status'),
    parsingErrors: text('parsing_errors'),

    // doc 04's `Importované`
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('flight_organization_idx').on(table.organizationId),
    unique('flight_id_organization_key').on(table.id, table.organizationId),

    // the tenant boundary as a foreign key, exactly as `training.training_type_id` carries
    // it. a plain references(device.id) would let a flight name another operator's airframe
    // and no policy would notice, because the row's own `organization_id` would be
    // perfectly correct.
    //
    // MATCH SIMPLE is the default and is what is wanted: `device_id` is nullable, and a
    // null there leaves the constraint unenforced rather than failing - which is what keeps
    // an unassigned flight writable.
    foreignKey({
      columns: [table.deviceId, table.organizationId],
      foreignColumns: [device.id, device.organizationId],
      name: 'flight_device_id_organization_id_fk',
    }).onDelete('restrict'),

    // tenant-scoped on both halves and no restrictive delete policy, like `training` and
    // unlike `person`: a flight is the operator's own record, and deleting one is the same
    // authority as writing one. what protects the airframe's history is the `restrict`
    // above, not a policy on this table.
    pgPolicy('flight_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
    }),
  ],
)

// a leg or sampling window within a flight - one imported file yields several, which is
// what doc 04's `Záznamy logov` count counts. the flight is the unit of record; this is the
// detail.
//
// it carries `organization_id` rather than reaching `flight` through a policy subquery, for
// the reason `training_device` does: a policy depending on a neighbour's policy to be
// correct is the coupling that breaks silently when one of the two is narrowed alone, and
// the composite foreign key below makes the denormalisation unable to drift. so it needs no
// foreign key to `organization` of its own - the reference into `flight` already forces the
// column to be a real flight's tenant.
export const flightLog = pgTable(
  'flight_log',
  {
    id: serial('id').primaryKey(),
    flightId: integer('flight_id').notNull(),
    organizationId: integer('organization_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    // seconds, like the flight's own figure. doc 03 records the predecessor rendering the
    // leg's duration as `hh:mm:ss`, which is a display of the same quantity.
    durationSeconds: integer('duration_seconds'),
    distanceMeters: numeric('distance_meters'),
    maxAltitudeMeters: numeric('max_altitude_meters'),

    // the airframe as the source file named it, which is not a reference to the register:
    // a log states what it states, and the flight's `device_id` is the assignment
    aircraft: text('aircraft'),
  },
  (table) => [
    index('flight_log_flight_idx').on(table.flightId),
    index('flight_log_organization_idx').on(table.organizationId),

    // cascade from the flight: a leg is not evidence apart from the flight it details, so
    // it goes with it
    foreignKey({
      columns: [table.flightId, table.organizationId],
      foreignColumns: [flight.id, flight.organizationId],
      name: 'flight_log_flight_id_organization_id_fk',
    }).onDelete('cascade'),

    pgPolicy('flight_log_tenant_isolation', {
      for: 'all',
      using: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
      withCheck: sql`${actingIsSuperadmin} or ${table.organizationId} in (${actingOrganizations})`,
    }),
  ],
)

// auth tables
//
// credentials are a separate optional concern attached to a person, so the account
// record is its own table with its own required e-mail. these carry no RLS: sign-in
// runs before any tenant context exists, so a policy keyed off the acting person would
// deny the very query that establishes who the acting person is. they are reached only
// through src/lib/auth, never through a tenant-scoped query path.

export const authUser = pgTable(
  'auth_user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    personId: integer('person_id').references(() => person.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_user_email_key').on(table.email),
    uniqueIndex('auth_user_person_key').on(table.personId),
  ],
)

export const authSession = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('auth_session_token_key').on(table.token)],
)

export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type SystemRole = (typeof systemRole.enumValues)[number]
export type OrganizationRole = (typeof organizationRole.enumValues)[number]
export type Organization = typeof organization.$inferSelect
export type Person = typeof person.$inferSelect
export type Device = typeof device.$inferSelect
export type DeviceType = typeof deviceType.$inferSelect
export type TrainingType = typeof trainingType.$inferSelect
export type Training = typeof training.$inferSelect
export type EntryMode = (typeof entryMode.enumValues)[number]
export type ParsingStatus = (typeof parsingStatus.enumValues)[number]
export type Flight = typeof flight.$inferSelect
export type FlightLog = typeof flightLog.$inferSelect
