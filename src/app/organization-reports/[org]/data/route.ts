import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { reportPayload, resolveSelection } from '@/lib/report/payload'
import { identifier } from '@/lib/routes/identifier'
import { listOrganizationFlights } from '@/lib/tenant/scoped-flights'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import { withTenant } from '@/lib/tenant/tenant-context'

// the operator report's data endpoint - docs/specs/06-org-report.md §"Data endpoint". the
// first surface outside /admin to read tenant-owned data, and the whole contract of the
// screen doc 06 calls the product's real face.
//
// the directory is `[org]` and not `[id]`, the same spelling the organisation workspace
// uses: the oracle spells the path `/organization-reports/{org}/data` and
// tests/contracts/routes.test.ts maps a `[segment]` directory to `{segment}`, so the
// oracle's spelling is the directory's name. the *value* is the organisation's serial id
// and never its report token, which is reserved for a share link that does not exist yet.
//
// no branch here asks whether the session is allowed. `{org}` is a selection and
// `flight_tenant_isolation` is the boundary: an organisation the session holds no
// membership of yields no row, and a request with nothing to answer is not-found - refusing
// would confirm the organisation is real.

const notFound = () => new Response(null, { status: 404 })

// every response is scoped to one resolved session, so a shared cache holding one would
// hand one operator's report to another operator's request - the floor
// src/lib/routes/stored-file.ts states for the same reason.
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'cache-control': 'private' } })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
): Promise<Response> {
  // src/middleware.ts turns an anonymous visitor away, but it reads the presence of a
  // session cookie and nothing more. a cookie that no longer resolves to a person is
  // anonymous as far as this handler is concerned.
  const session = await actingSession()
  if (!session) return notFound()

  const id = identifier((await params).org)
  if (id === null) return notFound()

  // the clock is injected rather than read inside the period resolution, so "this month" is
  // testable - the reasoning `ServiceReadings.asOf` records in service-schedule.ts
  const selection = resolveSelection(new URL(request.url).searchParams, new Date())
  if (selection === null) return json({ success: false, error: t('report.error.period') }, 400)

  const entries = await withTenant(db, session, async (tx) => {
    const organization = await findOrganization(tx, id)
    if (!organization) return null
    return listOrganizationFlights(tx, organization.id, selection)
  })
  if (entries === null) return notFound()

  return json(reportPayload(entries, selection), 200)
}
