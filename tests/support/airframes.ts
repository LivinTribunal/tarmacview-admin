import type { Device, DeviceType, MaintenanceLog } from '@/lib/db/schema'
import type { ServiceReadings } from '@/lib/devices/service-schedule'

// plain objects for the pure suites - no database, no fixtures, invented values only.

const epoch = new Date('2026-08-15T00:00:00Z')

// one maintenance record as a technician stated it. the names are obvious placeholders for
// the reason tests/support/fixtures.ts gives: these two columns hold real people in the
// predecessor.
export function maintenanceRecord(overrides: Partial<MaintenanceLog> = {}): MaintenanceLog {
  return {
    id: 1,
    organizationId: 1,
    deviceId: 1,
    maintenanceDate: '2026-05-20',
    totalFlightHours: '41:30',
    totalFlights: 120,
    maintenancePerformedBy: 'PLACEHOLDER-TECHNICIAN-0001',
    faultAndMaintenanceDescription: 'Placeholder maintenance description.',
    preflightCheckPerformedBy: 'PLACEHOLDER-INSPECTOR-0001',
    createdAt: epoch,
    ...overrides,
  }
}

export function readings(overrides: Partial<ServiceReadings> = {}): ServiceReadings {
  return {
    baselineCycles: 0,
    lifetimeCycles: 0,
    baselineDate: null,
    asOf: epoch,
    ...overrides,
  }
}

export function configuredType(overrides: Partial<DeviceType> = {}): DeviceType {
  return {
    id: 1,
    name: 'Placeholder Quadcopter',
    maxVlos: '500',
    serviceInterval: 50,
    serviceIntervalMonths: 12,
    batteryServiceInterval: 100,
    maintenanceInstructions: 'Placeholder maintenance instructions.',
    createdAt: epoch,
    ...overrides,
  }
}

export function testAirframe(overrides: Partial<Device> = {}): Device {
  return {
    id: 1,
    organizationId: 1,
    serialNumber: 'SN-ALPHA-0001',
    name: 'Alpha One',
    model: 'Placeholder Model',
    manufacturer: 'Placeholder Manufacturer',
    deviceTypeId: 1,
    status: 'active',
    notes: null,
    createdAt: epoch,
    ...overrides,
  }
}
