import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  serial,
  text,
  timestamp,
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
export const deviceStatus = pgEnum('device_status', ['active', 'inactive', 'maintenance', 'retired'])

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

    // no restrictive delete policy beside this one, unlike organization/person/membership:
    // a fleet is the operator's own record and deleting an airframe is the same authority
    // as writing one - docs/specs/03-data-model.md §"Delete authority in the rebuild".
    // that holds only while an airframe carries no history. when maintenance_log and
    // flight land they must reference device with `ON DELETE restrict`, the way the
    // organisation's dependents do above, or a member deletes the evidence with the row.
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
export type Device = typeof device.$inferSelect
export type DeviceType = typeof deviceType.$inferSelect
export type TrainingType = typeof trainingType.$inferSelect
