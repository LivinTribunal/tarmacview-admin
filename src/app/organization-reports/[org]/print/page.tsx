import { notFound, redirect } from 'next/navigation'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { formatDate, t } from '@/lib/i18n'
import {
  airframeReportTable,
  airframeReportTableRow,
  flightReportTable,
  flightReportTableRow,
  pilotReportTable,
  pilotReportTableRow,
} from '@/lib/report/fields'
import { readReport, submittedQuery } from '@/lib/report/read'
import {
  expiryWarnings,
  figure,
  reportTiles,
  selectionLines,
  tabLabels,
} from '@/lib/report/view'
import { identifier } from '@/lib/routes/identifier'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import { withTenant } from '@/lib/tenant/tenant-context'

// the printed operator pack - docs/specs/06-org-report.md §"The print view in the rebuild",
// the output that section calls the point of the tool. §Layout items 1 to 6 render here;
// item 7's action panels do not, because a pack carries evidence and not affordances.
//
// a second **rendering** and never a second report: the same `readReport` in one `withTenant`
// transaction, the same payload, and every figure off a key that payload already carries. two
// derivations of one number on a regulator-facing document is the worst place in the product
// for them to drift.
//
// no `IndexTable` here. its chrome is a client component with column visibility, sorting and
// pagination, and its own default page size is ten - so a compliance pack rendered through it
// would silently omit row eleven, which is the gap-reading-as-a-fact this document rules out
// everywhere. the registers render as plain server-side tables instead, every row, in the
// payload's own order. that is the call the detail views already made, for the same reason.
//
// no stylesheet ships with it. there is no CSS anywhere in this repo yet, so a print
// stylesheet would be the first - and branding is ours and is defined separately, so it is
// not written ahead of the design that owns it. `Tlačiť PDF` is the predecessor's Observed
// wording for the control and not a commitment to generate a PDF server-side: this route
// serves html, which is also what the capture recorded for it.

// one register, from the very `TableDeclaration` the screen renders. the headings and the
// cell keys are read off it and `linkPath` is ignored - the only chrome-bearing field these
// three declarations carry. `imagePath` and the rest are chrome too and would need handling
// here if a report column ever grew one; doc 06 says which. minting a second column list here
// would let the pack and the screen come to disagree about what a register contains.
//
// cells go through `figure`, so the decimal comma and the blank marker are the chrome's own
// single implementation rather than a second copy of either.
function PrintTable({
  declaration,
  rows,
}: {
  declaration: TableDeclaration
  rows: readonly TableRow[]
}) {
  if (rows.length === 0) return <p>{t(declaration.emptyKey)}</p>

  return (
    <table>
      <thead>
        <tr>
          {declaration.columns.map((column) => (
            <th key={column.key} scope="col">
              {t(column.labelKey)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {declaration.columns.map((column) => (
              <td key={column.key}>{figure(row[column.key] ?? null)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function OrganizationReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // §Access: anonymous requests to the report, its data endpoint and its print view all
  // redirect to login. src/middleware.ts reads the presence of a session cookie and nothing
  // more, so a cookie that no longer resolves to a person is anonymous here too.
  const session = await actingSession()
  if (!session) redirect('/login')

  const id = identifier((await params).org)
  if (id === null) notFound()

  const asOf = new Date()
  const submitted = submittedQuery(await searchParams)

  // `?tab=` is deliberately not read, and neither is `?detail=`. a tab is an address on
  // screen rather than a section of the document: hiding one register behind the tab the
  // reader happened to be on would drop it from the printed record, and a pack carrying one
  // pilot's history and nobody else's reads as a document about that pilot. so no branch here
  // copies the page's `activeTab(...) === null → notFound()` either, or a parameter this
  // rendering ignores could still 404 the pack.
  //
  // no branch asks whether the session may see this organisation, the page's line exactly:
  // `{org}` is a selection and the row-level policies are the boundary, so an organisation
  // the session holds no membership of reads as absent.
  const read = await withTenant(db, session, (tx) =>
    readReport(tx, { organizationId: id, submitted, asOf }),
  )
  if (read === null) notFound()

  const { organization, pilots, data } = read
  const warnings = expiryWarnings(pilots)

  return (
    <main>
      {/* §Layout item 1, the screen's own header minus its two controls: the admin link and
          sign-out are navigation, and a printed pack states what was true rather than
          offering somewhere to go. the generation stamp renders as a date and carries no
          clock time - §"The print view in the rebuild" records why, since item 1 says
          timestamp and this is the slice that was owed the decision. */}
      <header>
        {/* a plain <img> for the reason src/components/index-table.tsx gives: the image
            optimizer fetches the source without the session cookie, and every tenant-scoped
            route would answer it not-found. */}
        {organization.logoPath && (
          <img src={`/api/organizations/${organization.id}/logo`} alt={organization.name} />
        )}
        <h1>{organization.name}</h1>

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
      </header>

      {/* §Layout item 2, and it takes no period, so it prints in both branches below. nobody
          with anything to surface means no block at all rather than an all-clear. */}
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

      {data === null ? (
        // the page's own substitution, printed. a pack whose figures are zero because two
        // dates arrived the wrong way round would say nothing was flown, so the error is
        // printed where the report body would be - and the reader arrived from the selector,
        // which is the way back to correcting it.
        <p>{t('report.error.query')}</p>
      ) : (
        <>
          {/* what the pack was produced under. the screen carries this in its controls and a
              document has none, so the period and the filters state themselves here - item 3
              is a selector on screen and a statement on paper. */}
          <section>
            <p>
              {t('report.period.selected', {
                from: data.period_dates.from,
                to: data.period_dates.to,
              })}
            </p>
            <dl>
              {selectionLines(submitted, data).map((line) => (
                <div key={line.labelKey}>
                  <dt>{t(line.labelKey)}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* §Layout item 4 */}
          <section>
            <dl>
              {reportTiles(data).map((tile) => (
                <div key={tile.labelKey}>
                  <dt>{t(tile.labelKey)}</dt>
                  <dd>{tile.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* §Layout item 5, both registers rather than the one a `?tab=` names. they are two
              of the three tables the pack is evidence from, and a document that dropped one
              of them would be missing a register rather than showing a closed tab. */}
          <section>
            <h2>{t(tabLabels.pilots)}</h2>
            <PrintTable
              declaration={pilotReportTable(submitted)}
              rows={data.pilots.map(pilotReportTableRow)}
            />
          </section>

          <section>
            <h2>{t(tabLabels.uas)}</h2>
            <PrintTable
              declaration={airframeReportTable(submitted)}
              rows={data.devices.map(airframeReportTableRow)}
            />
          </section>

          {/* §Layout item 6. every row of the period prints whatever state it is in: a failed
              parse keeps its row with its status and its error, and an unassigned flight keeps
              the named absences the payload carries. the airframes are handed over so the
              `Stav` cell can tell one that could not be judged from one that passed. */}
          <section>
            <h2>{t('report.flights.title')}</h2>
            <PrintTable
              declaration={flightReportTable}
              rows={data.flights.map((flight) => flightReportTableRow(flight, data.devices))}
            />
          </section>
        </>
      )}
    </main>
  )
}
