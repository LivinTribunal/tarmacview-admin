import { and, asc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { device, deviceType, flight, flightLog, person, type Flight } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// no organisation filter here, for the same reason there is none in scoped-airframes.ts,
// scoped-people.ts or scoped-trainings.ts: `flight_tenant_isolation` and
// `flight_log_tenant_isolation` scope these reads, so another operator's flight is not
// hidden by a WHERE clause somebody could forget - it does not exist as far as the
// connection is concerned. docs/specs/03-data-model.md §"Flights in the rebuild".

// `person` is joined twice, for two different people: the pilot who flew and whoever
// imported the record. the first read in the repo to need an alias.
const pilot = alias(person, 'pilot')
const importer = alias(person, 'importer')

export type FlightEntry = Flight & {
  // doc 04's `Predvolený pilot`, `Predvolené zariadenie (S/N)` and `Importoval`. each is
  // null where the flight names nobody *or* where the acting session cannot read the row
  // behind it, and both are gaps rather than passes.
  pilotName: string | null
  deviceSerialNumber: string | null
  importedByName: string | null
  // doc 04's `Záznamy logov`
  flightLogCount: number
}

// every join is a left join and each one is load-bearing. a flight with no pilot and no
// airframe is normal and expected - assignment is a later step - so it must list rather
// than fall out of the register, and it is the row most needing attention. a flight whose
// parse failed lists too: nothing here filters on `parsing_status`.
//
// only the flight-log join is to-many, so the count is over the one chain that multiplies
// and needs no `distinct` - the reasoning scoped-trainings.ts already records. the count
// runs inside the tenant transaction, following the `Školenia` precedent in
// scoped-training-types.ts, so a member counts the legs they can read and a superadmin
// counts the deployment's.
export function listFlights(tx: TenantTransaction): Promise<FlightEntry[]> {
  return tx
    .select({
      ...getTableColumns(flight),
      pilotName: pilot.name,
      deviceSerialNumber: device.serialNumber,
      importedByName: importer.name,
      flightLogCount: sql<number>`count(${flightLog.id})::int`,
    })
    .from(flight)
    .leftJoin(pilot, eq(pilot.id, flight.pilotId))
    .leftJoin(device, eq(device.id, flight.deviceId))
    .leftJoin(importer, eq(importer.id, flight.importedBy))
    .leftJoin(flightLog, eq(flightLog.flightId, flight.id))
    .groupBy(flight.id, pilot.id, device.id, importer.id)
    .orderBy(asc(flight.id))
}

// doc 06's operator report reads the flights of the organisation whose report is open,
// filtered by the period and the two optional filters its query string carries.
//
// `where organization_id` is a **selection and never a boundary**, the same line
// scoped-airframes.ts draws for the workspace: `flight_tenant_isolation` decides which rows
// the session may see at all, and this clause decides which of them the report is looking at.
export type FlightSelection = {
  from: Date
  to: Date
  pilotId: number | null
  deviceId: number | null
}

export type FlightReportEntry = Flight & {
  // null where the flight names nobody *and* where the acting session cannot read the person
  // it names - `pilot_id` on the row is what tells those two apart
  pilotName: string | null
  // both null where no airframe is assigned. `model` is nullable on an assigned one too,
  // which is a different gap from having no airframe at all
  deviceSerialNumber: string | null
  deviceModel: string | null
  // the airframe's VLOS limit, null where it has no device type or its type sets none -
  // either way there is no limit to judge a flight against
  deviceMaxVlos: string | null
  // the earliest leg start, null where the flight has no legs or no leg states one
  firstLegStartedAt: Date | null
}

// the flight's date, derived rather than stored - docs/specs/03-data-model.md §"Flights in
// the rebuild". stated once and used three times - in the select and the period filter
// below, and in scoped-airframes.ts for the service calendar's fallback - because a report
// that filtered on the import instant and displayed the log's date would list a july flight
// under august and show july in the row, and an airframe's service clock dated from when its
// logs were uploaded is the same error one table over.
//
// it groups by flight, so a caller selecting it groups by flight too.
//
// `mapWith` is load-bearing: the driver hands every timestamp back as text and the column
// decoders are what turn one into a Date, so an aggregate over a timestamp needs to borrow
// the column's decoder or it arrives as a string that nothing here would notice.
const firstLegStart = sql<Date | null>`min(${flightLog.startedAt})`.mapWith(flightLog.startedAt)
export const flightDate = sql<Date>`coalesce(${firstLegStart}, ${flight.createdAt})`.mapWith(
  flight.createdAt,
)

// a bound parameter in a raw fragment carries no column to take its type from, so the
// instant is sent as text and cast rather than handed to the driver as a Date
const instant = (at: Date) => sql`${at.toISOString()}::timestamptz`

// every join is a left join, for the reason `listFlights` gives above: a flight with no
// pilot and no airframe is the row most needing attention and must not fall out of the
// report. the device type comes along so the VLOS judgement runs on the same read, and its
// absence reaches the report as a gap rather than as a pass.
export function listOrganizationFlights(
  tx: TenantTransaction,
  organizationId: number,
  selection: FlightSelection,
): Promise<FlightReportEntry[]> {
  const filters: SQL[] = [eq(flight.organizationId, organizationId)]
  if (selection.pilotId !== null) filters.push(eq(flight.pilotId, selection.pilotId))
  if (selection.deviceId !== null) filters.push(eq(flight.deviceId, selection.deviceId))

  return tx
    .select({
      ...getTableColumns(flight),
      pilotName: pilot.name,
      deviceSerialNumber: device.serialNumber,
      deviceModel: device.model,
      deviceMaxVlos: deviceType.maxVlos,
      firstLegStartedAt: firstLegStart,
    })
    .from(flight)
    .leftJoin(pilot, eq(pilot.id, flight.pilotId))
    .leftJoin(device, eq(device.id, flight.deviceId))
    .leftJoin(deviceType, eq(deviceType.id, device.deviceTypeId))
    .leftJoin(flightLog, eq(flightLog.flightId, flight.id))
    .where(and(...filters))
    .groupBy(flight.id, pilot.id, device.id, deviceType.id)
    .having(sql`${flightDate} between ${instant(selection.from)} and ${instant(selection.to)}`)

    // by id, like every sibling read. the report's own ordering is the client's to make,
    // which is what `flight_date_sort` is in the payload for.
    .orderBy(asc(flight.id))
}

// a cross-tenant id yields no rows, so the caller renders not-found. refusing would confirm
// the record is real, which is exactly what the boundary is for.
export async function findFlight(tx: TenantTransaction, id: number): Promise<Flight | null> {
  const [row] = await tx.select().from(flight).where(eq(flight.id, id)).limit(1)
  return row ?? null
}
