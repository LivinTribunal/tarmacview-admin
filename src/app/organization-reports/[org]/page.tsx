import { notFound, redirect } from 'next/navigation'
import { SignOutForm } from '@/components/sign-out-form'
import { mayReachAdmin } from '@/lib/auth/capabilities'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { formatDate, t } from '@/lib/i18n'
import { reportPayload, resolveSelection } from '@/lib/report/payload'
import {
  expiryWarnings,
  periodOptions,
  reportTiles,
  selectedPeriod,
} from '@/lib/report/view'
import { identifier } from '@/lib/routes/identifier'
import { listOrganizationAirframeReport } from '@/lib/tenant/scoped-airframes'
import { listOrganizationFlights } from '@/lib/tenant/scoped-flights'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import { listOrganizationPilots } from '@/lib/tenant/scoped-people'
import { listOrganizationTrainings } from '@/lib/tenant/scoped-trainings'
import { withTenant } from '@/lib/tenant/tenant-context'

// the operator report - docs/specs/06-org-report.md §Layout items 1 to 4, the screen doc 06
// calls the product's real face. the tabs and the three tables are R4b's and the print view
// and the panels are R6's, so this is the page and everything on it that is not a table.
//
// it reads the very payload the data endpoint beside it serves, through the same builder in
// one `withTenant` transaction, and derives nothing of its own: every number here is already
// a key. a server component fetching its own http endpoint would double the work, lose the
// session, and make one screen two reads that can disagree.
//
// the directory is `[org]` and not `[id]`, the reason the data route and the workspace page
// both record: the oracle spells the path `{org}` and tests/contracts/routes.test.ts maps a
// `[segment]` directory to `{segment}`. the value is the organisation's serial id and never
// its report token.
//
// no branch here asks whether the session is allowed to see this organisation. `{org}` is a
// selection and the row-level policies are the boundary: an organisation the session holds
// no membership of reads as absent, because refusing would confirm it is real.

// next hands the query back as a record and `resolveSelection` parses the query string the
// endpoint receives, so one shape reaches the resolver and the two surfaces cannot disagree
// about what a period is. a repeated parameter takes its first value, which is what a
// `get()` on the endpoint's own url would have answered.
function query(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) params.set(key, first)
  }
  return params
}

export default async function OrganizationReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // src/middleware.ts turns an anonymous visitor away, but it reads the presence of a
  // session cookie and nothing more. a cookie that no longer resolves to a person is
  // anonymous as far as this page is concerned.
  const session = await actingSession()
  if (!session) redirect('/login')

  const id = identifier((await params).org)
  if (id === null) notFound()

  // one instant answers every question the screen asks of a clock: which month the period
  // is, how overdue a service is, which expiries fall inside the window, and what the
  // generation stamp says.
  const asOf = new Date()
  const submitted = query(await searchParams)
  const selection = resolveSelection(submitted, asOf)

  const read = await withTenant(db, session, async (tx) => {
    const organization = await findOrganization(tx, id)
    if (!organization) return null

    // the four scoped reads run only where there is a period to read them for. an unusable
    // custom range has no window to query and the header is still this organisation's, so
    // the screen renders with the error where the report would be - `total_flights: 0`
    // there would say nothing was flown when what happened is that two dates arrived the
    // wrong way round.
    if (selection === null) return { organization, data: null }

    return {
      organization,
      data: reportPayload({
        entries: await listOrganizationFlights(tx, organization.id, selection),
        airframes: await listOrganizationAirframeReport(tx, organization.id),
        pilots: await listOrganizationPilots(tx, organization.id),
        trainings: await listOrganizationTrainings(tx, organization.id),

        // the warning window belongs to the organisation being reported on, off the row
        // already in hand rather than from a constant
        expiryWarningDays: organization.licenceExpiryWarningDays,
        selection,
        asOf,
      }).data,
    }
  })
  if (read === null) notFound()

  const { organization, data } = read
  const warnings = data === null ? [] : expiryWarnings(data.pilots)

  return (
    <main>
      <header>
        {/* the route #56 built, which takes an organisation id and nothing else - the
            stored path never reaches the browser. an absent logo renders no image rather
            than a broken one. a plain <img> for the reason src/components/index-table.tsx
            gives: the image optimizer fetches the source without the session cookie, and
            every tenant-scoped route would answer it not-found. */}
        {organization.logoPath && (
          <img src={`/api/organizations/${organization.id}/logo`} alt={organization.name} />
        )}
        <h1>{organization.name}</h1>

        {/* both regulatory numbers are nullable, and on a regulator-facing pack a blank
            beside a label reads as "none required" - so each absence gets a label naming
            it, the treatment `report.pilot.email.none` already sets. the generation stamp
            renders as a date: doc 06 says timestamp, src/lib/i18n prints one format, and
            CLAUDE.md says pick one and hold it. */}
        <dl>
          <dt>{t('organization.field.uas_registration_number')}</dt>
          <dd>
            {organization.uasRegistrationNumber ?? t('report.organization.registration.none')}
          </dd>
          <dt>{t('organization.field.specific_permit_number')}</dt>
          <dd>{organization.specificPermitNumber ?? t('report.organization.permit.none')}</dd>
          <dt>{t('report.header.generatedAt')}</dt>
          <dd>{formatDate(asOf)}</dd>
        </dl>

        {mayReachAdmin(session.systemRole) && (
          <a href="/admin/device-types">{t('report.header.admin')}</a>
        )}
        <SignOutForm />
      </header>

      {/* doc 06 §Layout item 2. nobody with anything to surface means no block at all
          rather than an all-clear: a flight or a certificate that could not be judged is
          not one that passed. */}
      {warnings.length > 0 && (
        <section>
          <h2>{t('report.warning.title')}</h2>
          <ul>
            {warnings.map((pilot) => (
              <li key={pilot.id}>
                <span>{pilot.name}</span>
                <ul>
                  {pilot.warnings.map((warning) => (
                    <li key={warning.labelKey}>
                      <span>{t(warning.labelKey)}</span>
                      <span>{warning.status}</span>
                      <span>{formatDate(warning.validUntil)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* a plain GET form, the way the workspace tabs round-trip through
          `?activeRelationManager={n}` and the way doc 06 §Print records the predecessor's
          own filter form. the two date inputs carry `YYYY-MM-DD`, the wire format
          `resolveSelection` parses, never the `DD.MM.YYYY` a reader sees.

          `Tlačiť PDF` sits beside this in §Layout item 3 and is R6's. */}
      <form method="get">
        <label htmlFor="report-period">{t('report.period.label')}</label>
        <select id="report-period" name="period" defaultValue={selectedPeriod(submitted.get('period')) ?? ''}>
          {periodOptions.map((option) => (
            <option key={option} value={option}>
              {t(`report.period.${option}`)}
            </option>
          ))}
        </select>

        <label htmlFor="report-date-from">{t('report.period.from')}</label>
        <input
          id="report-date-from"
          type="date"
          name="date_from"
          defaultValue={submitted.get('date_from') ?? ''}
        />
        <label htmlFor="report-date-to">{t('report.period.to')}</label>
        <input
          id="report-date-to"
          type="date"
          name="date_to"
          defaultValue={submitted.get('date_to') ?? ''}
        />

        <button type="submit">{t('report.period.submit')}</button>
      </form>

      {data === null ? (
        <p>{t('report.error.query')}</p>
      ) : (
        <section>
          <p>
            {t('report.period.selected', {
              from: data.period_dates.from,
              to: data.period_dates.to,
            })}
          </p>
          <dl>
            {reportTiles(data).map((tile) => (
              <div key={tile.labelKey}>
                <dt>{t(tile.labelKey)}</dt>
                <dd>{tile.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </main>
  )
}
