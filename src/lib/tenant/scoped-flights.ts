import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { device, flight, flightLog, person, type Flight } from '@/lib/db/schema'
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

// a cross-tenant id yields no rows, so the caller renders not-found. refusing would confirm
// the record is real, which is exactly what the boundary is for.
export async function findFlight(tx: TenantTransaction, id: number): Promise<Flight | null> {
  const [row] = await tx.select().from(flight).where(eq(flight.id, id)).limit(1)
  return row ?? null
}
