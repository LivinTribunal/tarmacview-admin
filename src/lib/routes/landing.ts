// where `/` lands, as a pure branch over the acting session's primary organisation -
// docs/specs/09-roles-permissions.md §"Sign-in and sign-out".
//
// split from src/app/page.tsx so tests/contracts/routes.test.ts can still assert that both
// destinations are paths the app router serves. the page itself now reads a membership, and a
// route-contract suite has no database to read one with.

// no primary organisation keeps the destination the interim decision set. a superadmin
// belonging to no organisation is the ordinary case rather than an error, and the device-type
// catalogue is readable to every session, so the fallback is not a wall.
const noReportLanding = '/admin/device-types'

export function landingPath(organizationId: number | null): string {
  return organizationId === null ? noReportLanding : `/organization-reports/${organizationId}`
}
