import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IndexTable } from '@/components/index-table'
import type { Device } from '@/lib/db/schema'
import { t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import { listAirframes } from '@/lib/tenant/scoped-airframes'
import { withTenant, type TenantSession } from '@/lib/tenant/tenant-context'
import { startTestDatabase, type TestDatabase } from '../support/database'
import { seedFixtures, type SeededIds } from '../support/fixtures'

// the chrome proved tenant-agnostic. the device-type catalogue is deployment-wide and
// carries no organisation binding (docs/specs/03-data-model.md §"Device types in the
// rebuild"), so the register it was built on cannot prove a scoped read survives the
// table. the airframe register can, and does it here: the same component over
// listAirframes under two organisation sessions, asserted on the markup each one
// produces.
//
// the declaration stays local to this test even though the real one now exists in
// src/lib/devices/fields.ts. what this file needs and that one does not declare is a bulk
// action: `Vymazať vybrané` is Observed in doc 05 §2 and the register does not carry it
// while no write path answers one, so the chrome's bulk branch would otherwise have no
// subject anywhere. tests/tenancy/organization-workspace.test.ts is where the real
// declaration is proved, over the scoped read it is actually rendered with.

const airframeTable: TableDeclaration = {
  // plainly a fixture's key and not a register's: this declaration never reaches a browser,
  // and the repo-wide uniqueness assertion in tests/domain/index-table-view.test.ts covers
  // the real ones
  resource: 'scoping-fixture',
  emptyKey: 'device.index.empty',
  bulkActionKey: 'device.action.deleteSelected',
  columns: [
    { key: 'serial_number', labelKey: 'device.column.serial_number', sortable: true },
    { key: 'model', labelKey: 'device.column.model' },
  ],
}

const airframeTableRow = (airframe: Device): TableRow => ({
  id: airframe.id,
  serial_number: airframe.serialNumber,
  model: airframe.model,
})

let harness: TestDatabase
let ids: SeededIds

beforeAll(async () => {
  harness = await startTestDatabase()
  ids = await seedFixtures(harness.owner)
}, 300_000)

afterAll(async () => {
  await harness?.stop()
})

// the chrome never queries: it is handed the rows a scoped read returned. so what this
// renders is exactly what the session was allowed to see, and nothing downstream of
// withTenant can widen it.
async function renderRegister(session: TenantSession): Promise<string> {
  const airframes = await withTenant(harness.app, session, listAirframes)
  return renderToStaticMarkup(
    createElement(IndexTable, {
      declaration: airframeTable,
      rows: airframes.map(airframeTableRow),
    }),
  )
}

describe('the index table over a scoped read', () => {
  it('renders one tenant its own airframes and none of the other tenant', async () => {
    const markup = await renderRegister({
      personId: ids.people.alphaManager,
      systemRole: 'member',
    })

    expect(markup).toContain('SN-ALPHA-0001')
    expect(markup).toContain('SN-ALPHA-0002')
    expect(markup).not.toContain('SN-BRAVO')
  })

  it('renders the other tenant its own, which is the half that makes the first mean something', async () => {
    const markup = await renderRegister({
      personId: ids.people.bravoManager,
      systemRole: 'member',
    })

    expect(markup).toContain('SN-BRAVO-0001')
    expect(markup).not.toContain('SN-ALPHA')
  })

  it('renders both organisations to a superadmin, so the exclusions above are the policy and not the markup', async () => {
    const markup = await renderRegister({
      personId: ids.people.systemAdmin,
      systemRole: 'superadmin',
    })

    expect(markup).toContain('SN-ALPHA-0001')
    expect(markup).toContain('SN-BRAVO-0001')
  })

  it('renders an airframe with no device type rather than dropping it', async () => {
    const markup = await renderRegister({
      personId: ids.people.alphaManager,
      systemRole: 'member',
    })

    // SN-ALPHA-0002 has no device type and no model, so it has no VLOS limit and no
    // service interval. the row is present and its empty cells are marked as empty -
    // a missing row would read as a register with nothing to answer for.
    expect(markup).toContain('SN-ALPHA-0002')
    expect(markup).toContain(t('table.blank'))
  })

  it('says the register is empty rather than rendering a table of nothing', async () => {
    const markup = await renderRegister({
      personId: ids.people.systemAdmin,
      systemRole: 'member',
    })

    expect(markup).toContain(t('device.index.empty'))
    expect(markup).not.toContain('SN-')
  })

  it('renders the bulk branch only because this resource declares one', async () => {
    const markup = await renderRegister({
      personId: ids.people.alphaManager,
      systemRole: 'member',
    })

    expect(markup).toContain(t('table.selectAll'))
    expect(markup).toContain(t('device.action.deleteSelected'))
    // and no actions column, because no airframe route is served yet
    expect(markup).not.toContain(t('table.actions'))
  })
})
