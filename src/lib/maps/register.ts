import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { map, mapKmlFile, type GeozoneMap } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// a map belongs to no operator, so there is nothing here to scope - and neither does a
// layer, so unlike src/lib/device-types/catalogue.ts the count beside the entry is the
// same figure for every session. no `WHERE` appears in this file and none should.
//
// it still runs inside withTenant: what admits these rows is the policy, and a register
// reading outside a tenant transaction would be one whose scoping is a decision in
// application code rather than a property of the database.
//
// filed here and not under src/lib/tenant/, where the scoped reads live: this one names
// no organisation, and that directory would claim a scoping it does not do.

export type MapEntry = GeozoneMap & { layerCount: number }

export function listMaps(tx: TenantTransaction): Promise<MapEntry[]> {
  return tx
    .select({
      ...getTableColumns(map),
      layerCount: sql<number>`count(${mapKmlFile.id})::int`,
    })
    .from(map)
    .leftJoin(mapKmlFile, eq(mapKmlFile.mapId, map.id))
    .groupBy(map.id)
    .orderBy(asc(map.id))
}
