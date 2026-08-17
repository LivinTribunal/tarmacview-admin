import { describe, expect, it } from 'vitest'
import { airframeTable, airframeTableRow } from '@/lib/devices/fields'
import { t } from '@/lib/i18n'
import { activeTabIndex, workspaceTabs } from '@/lib/organizations/workspace'
import { formatCell } from '@/lib/table/view'
import type { AirframeEntry } from '@/lib/tenant/scoped-airframes'

// the pure half of docs/specs/05-organization-workspace.md's workspace: which tab a
// request is looking at, and what the UAS tab renders for an airframe with no device
// type. no dom and no container, so it runs in the `unit` project.

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

  it('carries exactly one sub-register, and it is tab 2', () => {
    // this is what makes "only the active tab's query runs" true of this slice: the page
    // awaits the resolved tab's loader and there is no other loader to await. six tabs
    // render a label and query nothing.
    const built = workspaceTabs.flatMap((tab, index) => (tab.register ? [index] : []))
    expect(built).toEqual([2])
    expect(workspaceTabs[2]?.register?.declaration).toBe(airframeTable)
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
