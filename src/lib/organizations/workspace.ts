import { airframeTable, airframeTableRow } from '@/lib/devices/fields'
import type { MessageKey } from '@/lib/i18n'
import { identifier } from '@/lib/routes/identifier'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import { listOrganizationAirframes } from '@/lib/tenant/scoped-airframes'
import { listOrganizationPeople, listOrganizationPilots } from '@/lib/tenant/scoped-people'
import type { TenantTransaction } from '@/lib/tenant/tenant-context'
import {
  organizationPersonTable,
  organizationPersonTableRow,
  organizationPilotTable,
  organizationPilotTableRow,
} from '@/lib/users/fields'

// the seven sub-registers of docs/specs/05-organization-workspace.md and the pure half of
// the page that renders them: which tab a request is looking at, resolved without a dom
// and without a container. the workspace is addressed as `?activeRelationManager={n}`,
// exactly as contracts/routes.json records it - a query parameter, not a path segment.
//
// no relation-manager abstraction here, deliberately. a sub-register is an `IndexTable`
// over an organisation-scoped read, which is the three lines every register since the
// shared table has used. three tabs is where a shape would become visible, but two of the
// three are the same read of the same entity, so there is still nothing to generalise over
// - the extraction waits for the document buckets, which differ only by a constant.

export type TabRegister = {
  declaration: TableDeclaration
  load: (tx: TenantTransaction, organizationId: number) => Promise<readonly TableRow[]>
}

export type WorkspaceTab = {
  labelKey: MessageKey
  // the sub-register this tab renders, on the tabs that have one. the rest carry a label
  // and nothing else in this slice, and a tab with no register runs no query at all.
  register?: TabRegister
}

// doc 05's tab table, in its order - the index is the address, so the order is not
// cosmetic. tabs 0, 1 and 2 are built.
//
// three of the labels come out of `document.category.*` rather than a key of their own.
// those tabs manage a document bucket and nothing else, so the bucket's name is the tab's
// name - the same reuse src/lib/device-types/fields.ts makes of the form's labels, and a
// second catalogue entry holding the same word would only be a second place to translate it.
export const workspaceTabs: readonly WorkspaceTab[] = [
  {
    labelKey: 'organization.workspace.tab.people',
    register: {
      declaration: organizationPersonTable,
      load: async (tx, organizationId) =>
        (await listOrganizationPeople(tx, organizationId)).map(organizationPersonTableRow),
    },
  },
  {
    labelKey: 'organization.workspace.tab.pilots',
    register: {
      declaration: organizationPilotTable,
      load: async (tx, organizationId) =>
        (await listOrganizationPilots(tx, organizationId)).map(organizationPilotTableRow),
    },
  },
  {
    labelKey: 'organization.workspace.tab.uas',
    register: {
      declaration: airframeTable,
      load: async (tx, organizationId) =>
        (await listOrganizationAirframes(tx, organizationId)).map(airframeTableRow),
    },
  },
  { labelKey: 'document.category.forms' },
  { labelKey: 'document.category.permits' },
  { labelKey: 'document.category.operations' },
  { labelKey: 'organization.workspace.tab.incidents' },
]

// absent or unparseable is the first tab, which is what a bare `{org}/edit` opens.
//
// out of range is null, and the page turns that into not-found rather than falling back:
// a link to a tab that does not exist is a broken link and should read as one. a silent
// fallback would answer 200 for a tab nobody built, which is the reading that survives
// longest before anyone notices.
export function activeTabIndex(raw: unknown): number | null {
  const index = typeof raw === 'string' ? identifier(raw) : null
  if (index === null) return 0
  return index < workspaceTabs.length ? index : null
}
