import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { device, deviceType, type DeviceType } from '@/lib/db/schema'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// the catalogue is deployment-wide and carries no organisation binding, so there is
// nothing here to scope - docs/specs/03-data-model.md §"Device types in the rebuild".
// the airframe count beside each entry is a different matter: `device` is tenant-owned,
// so the join runs inside the tenant transaction and the policy scopes it. no
// organisation filter appears in this file, and none should: a member counts their own
// fleet and a superadmin counts the deployment, which is correct rather than a
// discrepancy.

export type CatalogueEntry = DeviceType & { airframeCount: number }

export function listDeviceTypes(tx: TenantTransaction): Promise<CatalogueEntry[]> {
  return tx
    .select({
      ...getTableColumns(deviceType),
      airframeCount: sql<number>`count(${device.id})::int`,
    })
    .from(deviceType)
    .leftJoin(device, eq(device.deviceTypeId, deviceType.id))
    .groupBy(deviceType.id)
    .orderBy(asc(deviceType.id))
}
