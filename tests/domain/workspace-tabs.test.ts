import { describe, expect, it } from 'vitest'
import { airframeTable, airframeTableRow } from '@/lib/devices/fields'
import {
  organizationFormTable,
  organizationOperationsTable,
  organizationPermitTable,
} from '@/lib/documents/fields'
import { t } from '@/lib/i18n'
import { activeTabIndex, workspaceTabs } from '@/lib/organizations/workspace'
import { formatCell } from '@/lib/table/view'
import type { AirframeEntry } from '@/lib/tenant/scoped-airframes'
import type { OrganizationPersonEntry } from '@/lib/tenant/scoped-people'
import {
  organizationPersonTable,
  organizationPersonTableRow,
  organizationPilotTable,
  organizationPilotTableRow,
} from '@/lib/users/fields'

// the pure half of docs/specs/05-organization-workspace.md's workspace: which tab a
// request is looking at, what the UAS tab renders for an airframe with no device type,
// and what the two people tabs render for the cells a person may leave empty. no dom and
// no container, so it runs in the `unit` project.
//
// the three document tabs declare their columns and their cells in
// tests/domain/document-columns.test.ts, beside the register they are the same entity as.
// what is asserted here is only which declaration each tab carries.

const airframe: AirframeEntry = {
  id: 9,
  organizationId: 4,
  serialNumber: 'SN-PLACEHOLDER-0001',
  name: null,
  model: 'Placeholder Model',
  manufacturer: 'Placeholder Manufacturer',
  deviceTypeId: 1,
  status: 'active',
  notes: null,
  createdAt: new Date('2026-08-15T00:00:00Z'),
  deviceTypeName: 'Placeholder Quadcopter',
}

const manager: OrganizationPersonEntry = {
  id: 11,
  name: 'Placeholder Manager',
  email: 'placeholder.manager@example.invalid',
  systemRole: 'member',
  certificateNumber: null,
  certificateTypes: [],
  certificateValidUntil: null,
  phoneNumber: 'PHONE-PLACEHOLDER-0001',
  position: 'Placeholder Post',
  createdAt: new Date('2026-08-17T00:00:00Z'),
  role: 'accountable_manager',
  isPrimaryContact: true,
}

// no e-mail, no phone and no job title, which is the pilot register's normal row
const pilot: OrganizationPersonEntry = {
  ...manager,
  id: 12,
  name: 'Placeholder Pilot',
  email: null,
  certificateNumber: 'CERT-PLACEHOLDER-0002',
  phoneNumber: null,
  position: null,
  role: 'pilot',
  isPrimaryContact: false,
}

describe('which tab the workspace is looking at', () => {
  it('opens the first tab when the parameter is absent, which is a bare {org}/edit', () => {
    expect(activeTabIndex(undefined)).toBe(0)
  })

  it('opens the first tab for anything that is not a plain decimal index', () => {
    // a repeated parameter arrives as an array, and none of these names a tab
    for (const raw of ['', 'uas', '1.5', '-1', ' 2 ', '1e0', ['2', '3']]) {
      expect(activeTabIndex(raw), `${JSON.stringify(raw)} named a tab`).toBe(0)
    }
  })

  it('opens the tab that was asked for', () => {
    expect(activeTabIndex('2')).toBe(2)
    expect(activeTabIndex('6')).toBe(6)
  })

  it('yields null for an index past the last tab, which the page renders as not-found', () => {
    // never a silent fallback to tab 0: a link to a tab that does not exist is a broken
    // link and should read as one, or it answers 200 for a tab nobody built
    expect(activeTabIndex('7')).toBeNull()
    expect(activeTabIndex('999999999')).toBeNull()
  })
})

describe('the seven tabs doc 05 records', () => {
  it('declares all seven, so the index is the address the oracle captured', () => {
    expect(workspaceTabs).toHaveLength(7)
  })

  it('carries six sub-registers, and they are tabs 0 through 5', () => {
    // this is what makes "only the active tab's query runs" true: the page awaits the
    // resolved tab's loader and there is no other loader to await. tab 6 renders a label
    // and queries nothing.
    const built = workspaceTabs.flatMap((tab, index) => (tab.register ? [index] : []))
    expect(built).toEqual([0, 1, 2, 3, 4, 5])
    expect(workspaceTabs[0]?.register?.declaration).toBe(organizationPersonTable)
    expect(workspaceTabs[1]?.register?.declaration).toBe(organizationPilotTable)
    expect(workspaceTabs[2]?.register?.declaration).toBe(airframeTable)
    expect(workspaceTabs[3]?.register?.declaration).toBe(organizationFormTable)
    expect(workspaceTabs[4]?.register?.declaration).toBe(organizationPermitTable)
    expect(workspaceTabs[5]?.register?.declaration).toBe(organizationOperationsTable)
  })


  it('gives each people tab its own empty wording', () => {
    // *Žiadni používatelia* is the deployment-wide register's sentence and reads wrong
    // under *Piloti*, which shows one operator's roster
    expect(organizationPersonTable.emptyKey).not.toBe(organizationPilotTable.emptyKey)
    for (const declaration of [organizationPersonTable, organizationPilotTable]) {
      expect(declaration.emptyKey).not.toBe('person.index.empty')
    }
  })
})

describe('the two people tabs and the cells they leave blank', () => {
  it('carries a cell for every declared column, on both tabs', () => {
    const rows = [
      [organizationPersonTable, organizationPersonTableRow(manager)],
      [organizationPilotTable, organizationPilotTableRow(pilot)],
    ] as const

    for (const [declaration, row] of rows) {
      for (const column of declaration.columns) {
        expect(row, `${declaration.resource}.${column.key} has no cell`).toHaveProperty(column.key)
      }
    }
  })

  it('names the role through the shared labels, so no role name is written here', () => {
    expect(organizationPersonTableRow(manager).role).toBe(
      t('person.organizationRole.accountable_manager'),
    )
    expect(organizationPersonTableRow({ ...manager, role: 'viewer' }).role).toBe(
      t('person.organizationRole.viewer'),
    )
  })

  it('states `Hlavná` where the flag is set and says nothing where it is not', () => {
    // `is_primary_contact` is `not null default false`, so it cannot tell "not the primary
    // contact" from "nobody ever set one". a negative word in every row would state a fact
    // the column does not carry; a blank reads as the gap it is.
    expect(organizationPersonTableRow(manager).primary_contact).toBe(t('person.primaryContact.yes'))

    const other = organizationPersonTableRow({ ...manager, isPrimaryContact: false })
    expect(other.primary_contact).toBeNull()
  })

  it('keeps a person with neither phone nor job title in the register, both cells blank', () => {
    const row = organizationPersonTableRow({ ...manager, phoneNumber: null, position: null })

    expect(row.phone_number).toBeNull()
    expect(row.position).toBeNull()
    expect(row.name).toBe('Placeholder Manager')
  })

  it('lists a pilot with no e-mail, with the gap visible', () => {
    // CONTEXT.md §People: a pilot may exist with no e-mail and no credentials. the empty
    // cell is the normal row for this register, never a broken one.
    const row = organizationPilotTableRow(pilot)

    expect(row.email).toBeNull()
    expect(row.name).toBe('Placeholder Pilot')
    expect(row.certificate_number).toBe('CERT-PLACEHOLDER-0002')
  })
})

describe('the UAS tab and the airframe with no device type', () => {
  it('carries a cell for every declared column', () => {
    const row = airframeTableRow(airframe)
    for (const column of airframeTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('names the type an airframe has', () => {
    expect(airframeTableRow(airframe).device_type).toBe('Placeholder Quadcopter')
  })

  it('states the gap where an airframe has none, rather than leaving the cell blank', () => {
    // the failure mode is quiet: a null here renders the blank marker, which reads as
    // "nothing to say" and is indistinguishable from an unfilled cell. without a device
    // type there is no VLOS limit and no service interval, so the airframe can never
    // register a violation or a service warning - that must never read as a pass.
    const untyped = airframeTableRow({ ...airframe, deviceTypeId: null, deviceTypeName: null })

    expect(untyped.device_type).toBe(t('device.type.unassigned'))
    expect(formatCell(untyped.device_type ?? null)).not.toBe(t('table.blank'))
    expect(untyped.device_type).not.toBe(airframeTableRow(airframe).device_type)
  })

  it('identifies the airframe by its serial number under doc 05 §2 `Zariadenie`', () => {
    // `Názov zariadenia` is nullable and this airframe has none. an identifying column
    // that is blank for the normal case identifies nothing.
    expect(airframeTableRow(airframe).serial_number).toBe('SN-PLACEHOLDER-0001')
    expect(airframeTable.columns[0]?.labelKey).toBe('device.column.device')
  })
})
