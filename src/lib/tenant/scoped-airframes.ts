import { asc, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import {
  device,
  deviceType,
  flight,
  flightLog,
  maintenanceLog,
  type Device,
  type DeviceType,
  type MaintenanceLog,
} from '@/lib/db/schema'
import { flightDate } from '@/lib/tenant/scoped-flights'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// there is no *tenant* filter in this file, and that is the point. the queries carry no
// organisation predicate that scopes them; the policies on `device` do, so an airframe
// belonging to another organisation is not hidden by a WHERE clause someone could forget
// - it does not exist as far as the connection is concerned.
//
// `listOrganizationAirframes` and `listOrganizationAirframeReport` below are the exceptions
// to the sentence above and not to the rule under it. each carries `where organization_id`,
// and that clause is a **selection and never a boundary** - the same line
// src/lib/tenant/scoped-documents.ts draws for `bucket`: it is the organisation being looked
// at, never the tenant a session is confined to. Dropping it widens the read to the acting
// session's *own* airframes across their other organisations, and never past them, which is
// the difference between a wrong screen and a breach.
// tests/tenancy/organization-workspace.test.ts asserts exactly that for the register, and
// tests/tenancy/report-data-isolation.test.ts for the report.

export type AirframeEntry = Device & { deviceTypeName: string | null }

// one select map for both reads, so the register and the unscoped list cannot drift apart
// unnoticed. the device type comes along because the register renders its absence as a
// visible gap - an airframe with no device type has no VLOS limit and no service interval
// - and a left join is what keeps such an airframe in the result at all.
const airframeEntry = { ...getTableColumns(device), deviceTypeName: deviceType.name }

export function listAirframes(tx: TenantTransaction): Promise<AirframeEntry[]> {
  return tx
    .select(airframeEntry)
    .from(device)
    .leftJoin(deviceType, eq(deviceType.id, device.deviceTypeId))
    .orderBy(asc(device.id))
}

// doc 05 §2's UAS tab: the fleet of the organisation whose workspace is open, which is one
// of the organisations the acting session already reads and not a wider set.
export function listOrganizationAirframes(
  tx: TenantTransaction,
  organizationId: number,
): Promise<AirframeEntry[]> {
  return tx
    .select(airframeEntry)
    .from(device)
    .leftJoin(deviceType, eq(deviceType.id, device.deviceTypeId))
    .where(eq(device.organizationId, organizationId))
    .orderBy(asc(device.id))
}

// doc 06's operator report reads the whole fleet of the organisation whose report is open -
// unfiltered by the period, because the report lists every airframe and states what each one
// did in the window rather than dropping the ones that flew nothing.
//
// `where organization_id` is the selection and `device_tenant_isolation` is the boundary,
// the line `listOrganizationAirframes` above draws.
export type AirframeReportEntry = {
  device: Device
  // null where the airframe has no type, which is the gap that leaves it with no VLOS limit
  // and no service interval. a nested select and not a flat spread: spread flat, an absent
  // type arrives as an object of nulls, and `serviceState` keys `no_device_type` on the
  // argument being null - so it would name the wrong gap on the one row where the gap is
  // the whole point.
  deviceType: DeviceType | null
  // all-time and never period-filtered: one cycle is one recorded flight for the life of the
  // airframe, and a service interval measured over a one-month window would reset every month
  lifetimeFlights: number
  // the first recorded flight's **derived** date, which the service calendar falls back to
  // where the airframe has never been serviced
  firstFlightDate: Date | null
  // the maintenance history, newest first
  maintenance: MaintenanceLog[]
}

export async function listOrganizationAirframeReport(
  tx: TenantTransaction,
  organizationId: number,
): Promise<AirframeReportEntry[]> {
  // one derived table, because the first recorded flight's date is a min over an expression
  // that is itself an aggregate - Postgres rejects that nested directly. per-flight dates
  // here, per-airframe totals over them below, and both all-time aggregates out of one pass.
  const perFlight = tx
    .select({ deviceId: flight.deviceId, at: flightDate.as('at') })
    .from(flight)
    .leftJoin(flightLog, eq(flightLog.flightId, flight.id))
    .where(eq(flight.organizationId, organizationId))
    .groupBy(flight.id)
    .as('flight_dates')

  const perAirframe = tx
    .select({
      deviceId: perFlight.deviceId,
      flights: sql<number>`count(*)::int`.as('flights'),
      firstAt: sql<Date>`min(${perFlight.at})`.mapWith(flight.createdAt).as('first_at'),
    })
    .from(perFlight)
    .groupBy(perFlight.deviceId)
    .as('airframe_flights')

  const airframes = await tx
    .select({
      device: getTableColumns(device),
      deviceType,

      // a left join and no flights is no row, which is zero cycles rather than an unknown
      lifetimeFlights: sql<number>`coalesce(${perAirframe.flights}, 0)::int`,
      firstFlightDate: perAirframe.firstAt,
    })
    .from(device)
    .leftJoin(deviceType, eq(deviceType.id, device.deviceTypeId))
    .leftJoin(perAirframe, eq(perAirframe.deviceId, device.id))
    .where(eq(device.organizationId, organizationId))
    .orderBy(asc(device.id))

  // newest first, and by id where two records state the same day - the later-entered reading
  // is the one a technician meant to stand
  const history = await tx
    .select()
    .from(maintenanceLog)
    .where(eq(maintenanceLog.organizationId, organizationId))
    .orderBy(desc(maintenanceLog.maintenanceDate), desc(maintenanceLog.id))

  return airframes.map((airframe) => ({
    ...airframe,
    maintenance: history.filter((log) => log.deviceId === airframe.device.id),
  }))
}

// a cross-tenant id yields no rows, so the caller renders not-found. nothing here knows
// the record exists and decides to refuse it - a forbidden response would confirm the
// airframe is real, which is exactly what the boundary is for.
export async function findAirframe(tx: TenantTransaction, id: number): Promise<Device | null> {
  const [row] = await tx.select().from(device).where(eq(device.id, id)).limit(1)
  return row ?? null
}
