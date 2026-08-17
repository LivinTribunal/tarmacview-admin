import { airframeTable, airframeTableRow } from '@/lib/devices/fields'
import {
  organizationDocumentTableRow,
  organizationFormTable,
  organizationOperationsTable,
  organizationPermitTable,
  organizationPermitTableRow,
} from '@/lib/documents/fields'
import type { MessageKey } from '@/lib/i18n'
import { identifier } from '@/lib/routes/identifier'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import { listOrganizationAirframes } from '@/lib/tenant/scoped-airframes'
import { listOrganizationDocuments } from '@/lib/tenant/scoped-documents'
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
// no relation-manager abstraction here, and now deliberately for good. a sub-register is an
// `IndexTable` over an organisation-scoped read, which is the three lines every register
// since the shared table has used. the document buckets were where #70 and #73 expected a
// shape to become visible - and what generalised turned out to be the *read* and not the
// declaration, because doc 05 §4 carries `Verejné` and names its first column the filename
// where §3 and §5 name it the document. so the extraction landed in
// scoped-documents.ts's `listOrganizationDocuments`, and six tabs still state their own
// three lines.

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
// cosmetic. tabs 0 through 5 are built; tab 6 is the occurrence register and its own slice.
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
  {
    labelKey: 'document.category.forms',
    register: {
      declaration: organizationFormTable,
      load: async (tx, organizationId) =>
        (await listOrganizationDocuments(tx, organizationId, 'forms')).map(
          organizationDocumentTableRow,
        ),
    },
  },
  {
    labelKey: 'document.category.permits',
    register: {
      declaration: organizationPermitTable,
      load: async (tx, organizationId) =>
        (await listOrganizationDocuments(tx, organizationId, 'permits')).map(
          organizationPermitTableRow,
        ),
    },
  },
  {
    labelKey: 'document.category.operations',
    register: {
      declaration: organizationOperationsTable,
      load: async (tx, organizationId) =>
        (await listOrganizationDocuments(tx, organizationId, 'operations')).map(
          organizationDocumentTableRow,
        ),
    },
  },
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
