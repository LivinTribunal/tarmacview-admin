import type { Organization } from '@/lib/db/schema'
import {
  pilotReportRows,
  reportPayload,
  resolveSelection,
  type ReportPayload,
} from '@/lib/report/payload'
import { expiryWindow, type PilotReportRow } from '@/lib/report/pilot-row'
import { listOrganizationAirframeReport } from '@/lib/tenant/scoped-airframes'
import { listOrganizationFlights } from '@/lib/tenant/scoped-flights'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import { listOrganizationPilots } from '@/lib/tenant/scoped-people'
import { listOrganizationTrainings } from '@/lib/tenant/scoped-trainings'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'

// the read the operator report's two renderings share - the screen and the print view.
// docs/specs/06-org-report.md §"The print view in the rebuild": a printed pack is a second
// rendering and never a second report, so both surfaces make the same reads, hand them to
// the same builder and render keys off one payload. a third hand-copied composition of it is
// exactly the drift that decision rules out, on the document least able to carry it.
//
// the caller opens its own `withTenant` and hands the transaction in, so this file adds no
// boundary of its own: `organizationId` is a selection and the row-level policies decide
// what the session may read. an organisation it holds no membership of reads as absent here,
// which is null, the same answer the page and the endpoint give.
//
// the data endpoint beside them is deliberately not a caller. its error branch is a 400 JSON
// envelope and it composes the payload outside its transaction, so folding it in would widen
// this to a behaviour change nobody asked for.

export type ReportRead = {
  organization: Organization
  // every rostered pilot, whatever the selection says and whether or not it was usable -
  // §Layout item 2's warnings block takes no period, so it is built in both branches
  pilots: readonly PilotReportRow[]
  // null where the selection cannot be read. a report of zeroes there would say nothing was
  // flown when what happened is that two dates arrived the wrong way round.
  data: ReportPayload['data'] | null
}

// next hands the query back as a record and `resolveSelection` parses the query string the
// endpoint receives, so one shape reaches the resolver and the surfaces cannot disagree about
// what a period is. a repeated parameter takes its first value, which is what a `get()` on
// the endpoint's own url would have answered.
export function submittedQuery(
  raw: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) params.set(key, first)
  }
  return params
}

export type ReportReadInput = {
  organizationId: number
  submitted: URLSearchParams
  // one instant answers every question a rendering asks of a clock: which month the period
  // is, how overdue a service is, which expiries fall inside the window, and what the
  // generation stamp says
  asOf: Date
}

export async function readReport(
  tx: TenantTransaction,
  input: ReportReadInput,
): Promise<ReportRead | null> {
  const organization = await findOrganization(tx, input.organizationId)
  if (!organization) return null

  // the roster reads take no selection, so they run whatever the period is
  const pilots = await listOrganizationPilots(tx, organization.id)
  const trainings = await listOrganizationTrainings(tx, organization.id)

  const selection = resolveSelection(input.submitted, input.asOf)
  if (selection === null) {
    return {
      organization,
      pilots: pilotReportRows({
        pilots,
        trainings,
        flights: new Map(),
        window: expiryWindow(input.asOf, organization.licenceExpiryWarningDays),
      }),
      data: null,
    }
  }

  const { data } = reportPayload({
    entries: await listOrganizationFlights(tx, organization.id, selection),
    airframes: await listOrganizationAirframeReport(tx, organization.id),
    pilots,
    trainings,

    // the warning window belongs to the organisation being reported on, off the row already
    // in hand rather than from a constant
    expiryWarningDays: organization.licenceExpiryWarningDays,
    selection,
    asOf: input.asOf,
  })
  return { organization, pilots: data.pilots, data }
}
