import type { OrganizationRole } from '@/lib/db/schema'

// the capability matrix from docs/specs/09-roles-permissions.md, as data rather than as
// branches in handlers. adding a capability is an edit to this table; a special case in
// a route is how a matrix stops describing the system.
export const capabilities = [
  'view_organisation_report',
  'assign_flight',
  'upload_flight_logs',
  'record_maintenance',
  'manage_aircraft_register',
  'manage_trainings',
  'manage_permits_and_operations_documents',
  'file_occurrence_report',
  'manage_people_and_memberships',
  'provision_or_reset_account',
  'manage_geozone_maps',
] as const

export type Capability = (typeof capabilities)[number]

// 'own' is the report's own-rows-only cell for a pilot; everything unlisted is 'none'.
export type Grant = 'full' | 'own' | 'none'

const granted: Record<OrganizationRole, Partial<Record<Capability, Grant>>> = {
  accountable_manager: {
    view_organisation_report: 'full',
    assign_flight: 'full',
    upload_flight_logs: 'full',
    record_maintenance: 'full',
    manage_aircraft_register: 'full',
    manage_trainings: 'full',
    manage_permits_and_operations_documents: 'full',
    file_occurrence_report: 'full',
    manage_people_and_memberships: 'full',
    provision_or_reset_account: 'full',
    manage_geozone_maps: 'full',
  },
  operations: {
    view_organisation_report: 'full',
    assign_flight: 'full',
    upload_flight_logs: 'full',
    record_maintenance: 'full',
    manage_aircraft_register: 'full',
    manage_trainings: 'full',
    file_occurrence_report: 'full',
    manage_geozone_maps: 'full',
  },
  pilot: {
    view_organisation_report: 'own',
    file_occurrence_report: 'full',
  },
  viewer: {
    view_organisation_report: 'full',
  },
}

// deny by default, including for a person with no membership at all: authority comes
// from a membership, so no membership is no authority rather than an error state.
export function can(role: OrganizationRole | null, capability: Capability): Grant {
  if (role === null) return 'none'
  return granted[role][capability] ?? 'none'
}
