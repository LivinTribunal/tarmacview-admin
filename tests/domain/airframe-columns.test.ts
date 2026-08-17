import { describe, expect, it } from 'vitest'
import { airframeTable } from '@/lib/devices/fields'

// docs/specs/05-organization-workspace.md §2, asserted as a declaration - filed beside
// map-columns.test.ts and for the reason it gives: there is no extracted column oracle for
// this tab, only the prose.
//
// the sibling assertion in workspace-tabs.test.ts iterates the declaration, so it holds for
// any column set at all. this file is the one that pins which columns and in what order,
// which is what every other register declaration already has.

describe('airframe index columns', () => {
  it('declares the columns the spec lists, in order', () => {
    expect(airframeTable.columns.map((column) => column.key)).toEqual([
      'serial_number',
      'model',
      'device_type',
      'manufacturer',
      'status',
    ])
  })

  // doc 05 §2 marks none of the five `^`, and the `Stav` filter it records is deliberately
  // not declared - src/lib/devices/fields.ts carries the reason
  it('declares no sortable column and no filter, matching the tab the spec records', () => {
    expect(airframeTable.columns.some((column) => column.sortable)).toBe(false)
    expect(airframeTable.filters).toBeUndefined()
  })
})
