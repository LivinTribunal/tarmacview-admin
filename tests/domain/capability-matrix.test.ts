import { describe, expect, it } from 'vitest'
import { can } from '@/lib/auth/capabilities'

// deny by default is the rule rather than the fallback, so the interesting assertions
// are the denials - docs/specs/09-roles-permissions.md §"Capability matrix".

describe('the capability matrix denies by default', () => {
  it('grants the accountable manager the posts the matrix gives it', () => {
    expect(can('accountable_manager', 'manage_people_and_memberships')).toBe('full')
    expect(can('accountable_manager', 'provision_or_reset_account')).toBe('full')
  })

  it('withholds from operations what the matrix withholds', () => {
    expect(can('operations', 'record_maintenance')).toBe('full')
    expect(can('operations', 'manage_permits_and_operations_documents')).toBe('none')
    expect(can('operations', 'manage_people_and_memberships')).toBe('none')
  })

  it('gives a pilot own rows on the report and no writes beyond an occurrence report', () => {
    expect(can('pilot', 'view_organisation_report')).toBe('own')
    expect(can('pilot', 'file_occurrence_report')).toBe('full')
    expect(can('pilot', 'assign_flight')).toBe('none')
  })

  it('keeps the viewer read-only', () => {
    expect(can('viewer', 'view_organisation_report')).toBe('full')
    expect(can('viewer', 'upload_flight_logs')).toBe('none')
  })

  it('gives a person with no membership nothing, which is a state and not an error', () => {
    expect(can(null, 'view_organisation_report')).toBe('none')
  })
})
