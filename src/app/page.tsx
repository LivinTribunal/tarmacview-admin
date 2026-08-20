import { redirect } from 'next/navigation'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { landingPath } from '@/lib/routes/landing'
import { findPrimaryOrganization } from '@/lib/tenant/scoped-organizations'
import { withTenant } from '@/lib/tenant/tenant-context'

// redirects and renders nothing, matching the shape doc 02 §Other records. it lands on the
// acting session's own organisation report, resolved from the primary-contact flag on its
// membership - docs/specs/03-data-model.md §"Membership in the rebuild" and
// docs/specs/09-roles-permissions.md §"Sign-in and sign-out".
//
// the membership read is the whole risk of this page, and it lives in
// src/lib/tenant/scoped-organizations.ts where its person filter is stated: a session that is
// not the primary contact of anything keeps the interim destination rather than landing on a
// co-member's report.
//
// src/middleware.ts turns an anonymous visitor away, but it reads the presence of a session
// cookie and nothing more. a cookie that no longer resolves to a person is anonymous here, the
// same branch the report page itself carries.
export default async function RootPage() {
  const session = await actingSession()
  if (!session) redirect('/login')

  const organizationId = await withTenant(db, session, (tx) =>
    findPrimaryOrganization(tx, session),
  )
  redirect(landingPath(organizationId))
}
