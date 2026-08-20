import { notFound, redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { SignOutForm } from '@/components/sign-out-form'
import { mayReachAdmin } from '@/lib/auth/capabilities'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { formatDate, t } from '@/lib/i18n'
import type { DeviceReportRow } from '@/lib/report/device-row'
import {
  pilotReportRows,
  reportPayload,
  resolveSelection,
  type ReportPayload,
} from '@/lib/report/payload'
import { expiryWindow, type PilotReportRow } from '@/lib/report/pilot-row'
import {
  activeTab,
  airframeReportTable,
  airframeReportTableRow,
  detailRow,
  expiryWarnings,
  periodOptions,
  pilotReportTable,
  pilotReportTableRow,
  reportTabs,
  reportTiles,
  selectedPeriod,
  tabHref,
  tabLabels,
  type ReportTab,
} from '@/lib/report/view'
import { identifier } from '@/lib/routes/identifier'
import { formatCell } from '@/lib/table/view'
import { listOrganizationAirframeReport } from '@/lib/tenant/scoped-airframes'
import { listOrganizationFlights } from '@/lib/tenant/scoped-flights'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import { listOrganizationPilots } from '@/lib/tenant/scoped-people'
import { listOrganizationTrainings } from '@/lib/tenant/scoped-trainings'
import { withTenant } from '@/lib/tenant/tenant-context'

// the operator report - docs/specs/06-org-report.md §Layout items 1 to 5, the screen doc 06
// calls the product's real face. the flights table and the pilot filter are R4c's and the
// print view and the panels are R6's.
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

// a stated figure through the repo's one formatter, so the decimal comma is not implemented
// twice, and an absent one as the blank marker the chrome already renders for a null cell.
const stated = (value: number | null): string => formatCell(value) ?? t('table.blank')

// the detail views are plain server-rendered markup and not `IndexTable`: its chrome is
// register behaviour, a disclosure inside a report is not a register, a `resource` key per
// detail would pollute the column-visibility store, and a client component's state does not
// survive the print view R6 needs. the payload's nested arrays could not ride in a flat
// `TableRow` anyway.
//
// neither of these reads anything. every array below is already in the payload the page holds,
// and a detail that wanted a query would have grown past this slice.
function PilotDetail({ pilot }: { pilot: PilotReportRow }) {
  return (
    <section>
      <h3>{t('report.detail.pilot')}</h3>
      <p>{pilot.name}</p>

      {/* all-time: a qualification does not stop existing because the reader picked last
          month. `date_start` is either an iso day or the label naming the gap, so it goes
          through formatDate and falls back to itself rather than to a blank. */}
      <h4>{t('report.detail.trainings')}</h4>
      {pilot.trainings.length === 0 ? (
        <p>{t('training.index.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('training.column.name')}</th>
              <th scope="col">{t('training.column.training_type')}</th>
              <th scope="col">{t('training.field.held_on')}</th>
              <th scope="col">{t('training.field.valid_until')}</th>
              <th scope="col">{t('training.column.devices')}</th>
              <th scope="col">{t('report.column.status')}</th>
            </tr>
          </thead>
          <tbody>
            {pilot.trainings.map((training) => (
              <tr key={training.name}>
                <td>{training.name}</td>
                <td>{training.training_type}</td>
                <td>{formatDate(training.date_start) ?? training.date_start}</td>
                <td>{formatDate(training.date_end) ?? t('table.blank')}</td>
                <td>{training.devices.join(', ') || t('table.blank')}</td>
                <td>{training.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>{t('report.detail.flights')}</h4>
      {pilot.filtered_flights.length === 0 ? (
        <p>{t('flight.index.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('report.column.date')}</th>
              <th scope="col">{t('device.column.serial_number')}</th>
              <th scope="col">{t('device.column.model')}</th>
              <th scope="col">{t('flight.field.flight_time')}</th>
            </tr>
          </thead>
          <tbody>
            {pilot.filtered_flights.map((flight) => (
              <tr key={flight.id}>
                <td>{flight.flight_date_display}</td>
                <td>{flight.device_serial_number}</td>
                <td>{flight.device_model}</td>
                <td>{stated(flight.flight_hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* the totals only. the rows under each group are the very rows the block above lists -
          that is what makes the two arrays agree structurally - so listing them twice would
          be the same evidence printed a second time. */}
      <h4>{t('report.detail.flightsByDevice')}</h4>
      {pilot.flights_by_device.length === 0 ? (
        <p>{t('flight.index.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('device.column.serial_number')}</th>
              <th scope="col">{t('device.column.model')}</th>
              <th scope="col">{t('report.column.flights')}</th>
              <th scope="col">{t('report.column.totalTime')}</th>
            </tr>
          </thead>
          <tbody>
            {pilot.flights_by_device.map((group) => (
              <tr key={group.device_serial_number}>
                <td>{group.device_serial_number}</td>
                <td>{group.device_model}</td>
                <td>{stated(group.total_flights)}</td>
                <td>{stated(group.total_flight_hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function AirframeDetail({ airframe }: { airframe: DeviceReportRow }) {
  return (
    <section>
      <h3>{t('report.detail.uas')}</h3>
      <p>{airframe.serial_number}</p>

      {/* the gap and the due service both name themselves here; a service that is not due
          says nothing, which is the affirmative-only rule. where the airframe is not
          configured the whole block below is null, so the warning is the answer rather than
          a column of blanks. */}
      <h4>{t('report.column.service')}</h4>
      {airframe.service_warning && <p>{airframe.service_warning}</p>}
      {airframe.service_is_configured && (
        <dl>
          <dt>{t('report.service.intervalCycles')}</dt>
          <dd>{stated(airframe.service_interval_cycles)}</dd>
          <dt>{t('report.service.intervalMonths')}</dt>
          <dd>{stated(airframe.service_interval_months)}</dd>
          <dt>{t('report.service.nextAtCycles')}</dt>
          <dd>{stated(airframe.next_service_at_cycles)}</dd>
          <dt>{t('report.service.nextDate')}</dt>
          <dd>{formatDate(airframe.next_service_date) ?? t('table.blank')}</dd>
          <dt>{t('report.service.remainingCycles')}</dt>
          <dd>{stated(airframe.service_remaining_cycles)}</dd>
          <dt>{t('report.service.remainingDays')}</dt>
          <dd>{stated(airframe.service_remaining_days)}</dd>
          <dt>{t('report.service.overdueCycles')}</dt>
          <dd>{stated(airframe.service_overdue_cycles)}</dd>
          <dt>{t('report.service.overdueDays')}</dt>
          <dd>{stated(airframe.service_overdue_days)}</dd>
          {airframe.service_due_reasons.length > 0 && (
            <>
              <dt>{t('report.service.dueReasons')}</dt>
              <dd>{airframe.service_due_reasons.join(', ')}</dd>
            </>
          )}
        </dl>
      )}

      {/* the technician's figures as they were stated, and never recomputed. the hours are
          text - `h:mm` and a decimal comma are both real inputs - so they render verbatim,
          and a null flight count names the absence rather than printing `0`, which would be
          a reading nobody took. `Pridať záznam údržby` is R5's. */}
      <h4>{t('report.detail.maintenance')}</h4>
      {airframe.maintenance_logs.length === 0 ? (
        <p>{t('report.maintenance.empty')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('report.maintenance.date')}</th>
              <th scope="col">{t('report.maintenance.totalFlightHours')}</th>
              <th scope="col">{t('report.maintenance.totalFlights')}</th>
              <th scope="col">{t('report.maintenance.performedBy')}</th>
              <th scope="col">{t('report.maintenance.description')}</th>
              <th scope="col">{t('report.maintenance.preflightCheckBy')}</th>
            </tr>
          </thead>
          <tbody>
            {airframe.maintenance_logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDate(log.maintenance_date) ?? log.maintenance_date}</td>
                <td>{log.total_flight_hours}</td>
                <td>
                  {log.total_flights === null
                    ? t('report.maintenance.totalFlights.none')
                    : stated(log.total_flights)}
                </td>
                <td>{log.maintenance_performed_by ?? t('table.blank')}</td>
                <td>{log.fault_and_maintenance_description ?? t('table.blank')}</td>
                <td>{log.preflight_check_performed_by ?? t('table.blank')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// doc 06 §Layout item 5. one tab is active at a time and both are addressed on the query
// string, so a link to either is a url a reader can send - the workspace's
// `?activeRelationManager={n}` precedent, and the same server-rendered disclosure for the
// detail a row opens: it is linkable, it survives the print view, and it cannot disagree with
// the payload the page already holds.
//
// the whole block sits inside the report body rather than beside it. the pilots table's two
// count columns are the period's own figures, and the UAS table has none without a payload -
// so an unusable range renders the query error here too, instead of a register of zeroes
// stating that nothing was flown.
function ReportTabs({
  data,
  active,
  submitted,
}: {
  data: ReportPayload['data']
  active: ReportTab
  submitted: URLSearchParams
}) {
  const detail = submitted.get('detail')

  // one register and one detail, both the active tab's. the table the reader is not looking
  // at is neither built nor rendered, the way the workspace loads only the tab it was asked
  // for - here it costs a `map` rather than a query, and the shape is the same.
  const register =
    active === 'pilots'
      ? { declaration: pilotReportTable(submitted), rows: data.pilots.map(pilotReportTableRow) }
      : {
          declaration: airframeReportTable(submitted),
          rows: data.devices.map(airframeReportTableRow),
        }

  const openPilot = active === 'pilots' ? detailRow(data.pilots, detail) : null
  const openAirframe = active === 'uas' ? detailRow(data.devices, detail) : null

  return (
    <section>
      <nav>
        {reportTabs.map((tab) => (
          <a
            key={tab}
            href={tabHref(submitted, tab)}
            aria-current={tab === active ? 'page' : undefined}
          >
            {t(tabLabels[tab])}
          </a>
        ))}
      </nav>

      <IndexTable declaration={register.declaration} rows={register.rows} />

      {/* the way back out of a disclosure the url names. an id naming no row in the active
          tab opens nothing and the table stands alone, which is where the scoping is
          structural: another operator's id was never in this payload to be found. */}
      {(openPilot || openAirframe) && (
        <a href={tabHref(submitted, active)}>{t('report.detail.close')}</a>
      )}
      {openPilot && <PilotDetail pilot={openPilot} />}
      {openAirframe && <AirframeDetail airframe={openAirframe} />}
    </section>
  )
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

  // resolved before the read, like the workspace's tab index and for the same reason: a tab
  // nobody built is a broken link and answers not-found rather than the first tab
  const active = activeTab(submitted.get('tab'))
  if (active === null) notFound()

  const read = await withTenant(db, session, async (tx) => {
    const organization = await findOrganization(tx, id)
    if (!organization) return null

    // the roster reads take no selection, so they run whatever the period is
    const pilots = await listOrganizationPilots(tx, organization.id)
    const trainings = await listOrganizationTrainings(tx, organization.id)

    // the period-filtered pair runs only where there is a period to read them for, and an
    // unusable custom range renders the error where the report would be - `total_flights: 0`
    // there would say nothing was flown when what happened is that two dates arrived the
    // wrong way round.
    //
    // the warnings block over it is not part of that report body, so its rows are built here
    // too: an absent block already means *nobody has anything pending*, and a mistyped range
    // rendering that screen would withdraw a lapsing certificate from the reader who typed it.
    if (selection === null) {
      return {
        organization,
        pilots: pilotReportRows({
          pilots,
          trainings,
          flights: new Map(),
          window: expiryWindow(asOf, organization.licenceExpiryWarningDays),
        }),
        data: null,
      }
    }

    const { data } = reportPayload({
      entries: await listOrganizationFlights(tx, organization.id, selection),
      airframes: await listOrganizationAirframeReport(tx, organization.id),
      pilots,
      trainings,

      // the warning window belongs to the organisation being reported on, off the row
      // already in hand rather than from a constant
      expiryWarningDays: organization.licenceExpiryWarningDays,
      selection,
      asOf,
    })
    return { organization, pilots: data.pilots, data }
  })
  if (read === null) notFound()

  const { organization, pilots, data } = read
  const warnings = expiryWarnings(pilots)

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
          {/* a period this application does not name selects this rather than nothing: an
              empty value matches no option below and a browser then displays the first,
              which would show `Tento mesiac` beside the error saying no period was read.
              the empty choice src/components/resource-form.tsx offers is a state a reader
              may pick; this one is only a state they can arrive in, so it is disabled. */}
          <option value="" disabled>
            {t('report.period.none')}
          </option>
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

        {/* the tab the reader is on, carried across a period submit. without it, resubmitting
            a period throws them back to the first tab; the open detail is not carried, because
            a form submits its own fields and a new window is a new question. */}
        <input type="hidden" name="tab" value={active} />

        <button type="submit">{t('report.period.submit')}</button>
      </form>

      {data === null ? (
        <p>{t('report.error.query')}</p>
      ) : (
        <>
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

          <ReportTabs data={data} active={active} submitted={submitted} />
        </>
      )}
    </main>
  )
}
