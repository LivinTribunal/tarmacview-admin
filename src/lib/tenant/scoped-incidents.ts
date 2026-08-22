import { asc, eq, getTableColumns } from 'drizzle-orm'
import { flight, incident, type Incident } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// there is no *tenant* filter in this file, and that is the point: `incident_tenant_isolation`
// scopes these reads, so another operator's occurrence report is not hidden by a WHERE
// clause somebody could forget - it does not exist as far as the connection is concerned.
// docs/specs/03-data-model.md §"Incidents in the rebuild".
//
// `listOrganizationIncidents` below carries `where organization_id`, and that clause is a
// **selection and never a boundary** - the same line scoped-airframes.ts and
// scoped-documents.ts draw: it is the organisation being looked at, never the tenant a
// session is confined to.

export type IncidentEntry = Incident & {
  // doc 05 §6's `Let`. the flight's own display name, which doc 03 §Flight says is its
  // source filename - null where the incident names no flight, which doc 05 §6 calls the
  // *optional* case and is the normal one, and null again where the flight it names carries
  // no filename. both are gaps and neither is a pass.
  flightFileName: string | null
}

// doc 05 §6's tab: the occurrence reports of the organisation whose workspace is open.
//
// the left join is load-bearing, and for a stronger reason than the ones above it: an
// incident with no flight is the case `incident_flight_id_organization_id_fk`'s MATCH SIMPLE
// exists to keep writable, so an inner join would drop exactly the rows the schema went out
// of its way to admit.
//
// the join needs no tenant predicate of its own. the composite foreign key already forces a
// named flight to be this incident's own tenant, so a session reading the incident reads the
// flight - which is the difference between this join and `document.uploaded_by`, where the
// name genuinely can be unreadable.
export function listOrganizationIncidents(
  tx: TenantTransaction,
  organizationId: number,
): Promise<IncidentEntry[]> {
  return tx
    .select({ ...getTableColumns(incident), flightFileName: flight.fileName })
    .from(incident)
    .leftJoin(flight, eq(flight.id, incident.flightId))
    .where(eq(incident.organizationId, organizationId))
    .orderBy(asc(incident.id))
}

// the row behind /api/incidents/{id}/file. a cross-tenant id yields nothing, so the handler
// renders not-found - refusing would confirm the report is real, which is exactly what the
// boundary is for.
export async function findIncident(tx: TenantTransaction, id: number): Promise<Incident | null> {
  const [row] = await tx.select().from(incident).where(eq(incident.id, id)).limit(1)
  return row ?? null
}
