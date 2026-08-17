import { describe, expect, it } from 'vitest'
import { mayManageDeviceTypes } from '@/lib/auth/capabilities'
import { deviceTypeTable, deviceTypeTableRow } from '@/lib/device-types/fields'
import { formatCell } from '@/lib/table/view'

// docs/specs/04-admin-resources.md §DeviceTypeResource, asserted as a declaration.
// deliberately not in tests/contracts/: there is no extracted column oracle, only the
// prose, and filing this beside the form contract would read as one.

const entry = {
  id: 3,
  name: 'Placeholder Quadcopter',
  maxVlos: '1.5',
  serviceInterval: 50,
  serviceIntervalMonths: 12,
  batteryServiceInterval: 100,
  maintenanceInstructions: 'Placeholder maintenance instructions.',
  createdAt: new Date('2026-08-15T00:00:00Z'),
  airframeCount: 4,
}

describe('device-type index columns', () => {
  it('declares the seven columns the spec lists, in order', () => {
    expect(deviceTypeTable(true).columns.map((column) => column.key)).toEqual([
      'id',
      'name',
      'max_vlos',
      'service_interval',
      'service_interval_months',
      'battery_service_interval',
      'devices',
    ])
  })

  it('marks every one of them sortable, as the spec does with `^`', () => {
    expect(deviceTypeTable(true).columns.every((column) => column.sortable)).toBe(true)
  })

  it('declares no toggle column, because the spec marks none', () => {
    expect(deviceTypeTable(true).columns.some((column) => column.hiddenByDefault)).toBe(false)
  })

  it('declares no filters and no bulk action', () => {
    expect(deviceTypeTable(true).filters).toBeUndefined()
    // Observed as `Odstrániť vybrané`, but no write path exists and a checkbox wired to
    // nothing is worse than no checkbox
    expect(deviceTypeTable(true).bulkActionKey).toBeUndefined()
  })

  it('points its row action at a route that is actually served, and only for a session that could complete it', () => {
    expect(deviceTypeTable(true).editPath).toBe('/admin/device-types/{id}/edit')
    expect(deviceTypeTable(false).editPath).toBeUndefined()
  })

  it('offers the row action to a superadmin and to nobody else', () => {
    // the narrowing is of the acting session's system role, not of the capability matrix -
    // `device_type_deployment_wide` is what refuses the write
    expect(mayManageDeviceTypes('superadmin')).toBe(true)
    expect(mayManageDeviceTypes('member')).toBe(false)
  })
})

describe('device-type index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = deviceTypeTableRow(entry)
    for (const column of deviceTypeTable(true).columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('keeps the airframe count as the number it is, so the column sorts numerically', () => {
    expect(deviceTypeTableRow(entry).devices).toBe(4)
  })

  it('renders the VLOS limit with a decimal comma', () => {
    expect(formatCell(deviceTypeTableRow(entry).max_vlos ?? null)).toBe('1,5')
  })

  it('leaves an unset interval blank rather than reading it as zero', () => {
    const row = deviceTypeTableRow({ ...entry, maxVlos: null, serviceInterval: null })
    expect(row.max_vlos).toBeNull()
    expect(row.service_interval).toBeNull()
  })
})
