import { describe, expect, it } from 'vitest'
import { flightTable, flightTableRow } from '@/lib/flights/fields'
import { t } from '@/lib/i18n'
import { formatCell } from '@/lib/table/view'
import type { FlightEntry } from '@/lib/tenant/scoped-flights'

// docs/specs/04-admin-resources.md §FlightResource, asserted as a declaration.
// deliberately not in tests/contracts/: there is no extracted column oracle, only the
// prose, and filing this beside the form contract would read as one.
//
// two of docs/rebuild/00-operating-model.md §5's named domain invariants become real here -
// *a flight can be created with neither pilot nor aircraft, and stays visible*, and *a
// failed parse is retained with its status and error, never dropped*. what the database
// does with them is tests/tenancy/flight-isolation.test.ts; what the register does with
// them is below, because a row the read returns and the register blanks is the same loss.

const entry: FlightEntry = {
  id: 12,
  organizationId: 1,
  deviceId: 4,
  pilotId: 3,
  importedBy: 2,
  fileName: 'placeholder-flight-0001.txt',
  entryMode: 'dji_log',
  totalFlightTimeSeconds: 5100,
  maxAltitudeMeters: '95.5',
  maxDistanceMeters: '420.25',
  totalDistanceMeters: '1830.75',
  parsingStatus: 'processed',
  parsingErrors: null,
  createdAt: new Date('2026-08-16T00:00:00Z'),
  pilotName: 'Placeholder Pilot',
  deviceSerialNumber: 'SN-PLACEHOLDER-0001',
  importedByName: 'Placeholder Manager',
  flightLogCount: 2,
}

describe('flight index columns', () => {
  it('declares the eleven columns the spec lists, in order', () => {
    expect(flightTable.columns.map((column) => column.key)).toEqual([
      'id',
      'file_name',
      'pilot',
      'device',
      'flight_logs',
      'status',
      'flight_time',
      'max_altitude',
      'total_distance',
      'imported_by',
      'created_at',
    ])
  })

  it('marks sortable only the columns carrying `^`', () => {
    expect(
      flightTable.columns.filter((column) => !column.sortable).map((column) => column.key),
    ).toEqual(['file_name', 'pilot', 'device', 'status', 'imported_by'])
  })

  it('hides the two columns doc 04 marks *(toggle)* until a reader enables them', () => {
    expect(
      flightTable.columns.filter((column) => column.hiddenByDefault).map((column) => column.key),
    ).toEqual(['imported_by', 'created_at'])
  })

  it('declares no filters and no bulk action', () => {
    // `Pilot` and `Zariadenie` are Observed, and both need per-tenant options where
    // FilterDef.options takes a static list - its own slice, not this one
    expect(flightTable.filters).toBeUndefined()
    expect(flightTable.bulkActionKey).toBeUndefined()
  })

  it('points its row action at a route that is actually served', () => {
    expect(flightTable.editPath).toBe('/admin/flights/{id}/edit')
  })
})

describe('flight index rows', () => {
  it('carries a cell for every declared column', () => {
    const row = flightTableRow(entry)
    for (const column of flightTable.columns) {
      expect(row, `${column.key} has no cell`).toHaveProperty(column.key)
    }
  })

  it('renders an unassigned flight as a row with gaps, never as no row at all', () => {
    const row = flightTableRow({
      ...entry,
      pilotId: null,
      deviceId: null,
      pilotName: null,
      deviceSerialNumber: null,
    })

    expect(row.pilot).toBeNull()
    expect(row.device).toBeNull()
    // the chrome renders the locale's blank marker for a null, so the cell reads as a gap
    expect(formatCell(row.pilot ?? null)).toBeNull()
    // and the rest of the row still says what the flight was
    expect(row.file_name).toBe('placeholder-flight-0001.txt')
  })

  it('shows the parsing status of a flight whose parse failed', () => {
    const row = flightTableRow({ ...entry, parsingStatus: 'failed' })
    expect(row.status).toBe(t('flight.parsingStatus.failed'))
  })

  it('leaves `Stav` blank where nothing was parsed, which is the manual-entry case', () => {
    // a status invented to fill the cell would report an outcome that never happened
    const row = flightTableRow({ ...entry, entryMode: 'manual', parsingStatus: null })
    expect(row.status).toBeNull()
  })

  it('renders the flight time as `h:mm`, the format the form accepts back', () => {
    expect(flightTableRow(entry).flight_time).toBe('1:25')
    expect(flightTableRow({ ...entry, totalFlightTimeSeconds: 36300 }).flight_time).toBe('10:05')
    expect(flightTableRow({ ...entry, totalFlightTimeSeconds: 0 }).flight_time).toBe('0:00')
    expect(flightTableRow({ ...entry, totalFlightTimeSeconds: null }).flight_time).toBeNull()
  })

  it('carries the measurements as numbers, so the decimal comma is applied once', () => {
    const row = flightTableRow(entry)
    expect(row.max_altitude).toBe(95.5)
    expect(formatCell(row.max_altitude ?? null)).toBe('95,5')
    expect(formatCell(row.total_distance ?? null)).toBe('1830,75')
  })

  it('counts the legs, and states none as none rather than as a blank', () => {
    expect(flightTableRow({ ...entry, flightLogCount: 0 }).flight_logs).toBe(0)
    expect(formatCell(flightTableRow({ ...entry, flightLogCount: 0 }).flight_logs ?? null)).toBe(
      '0',
    )
  })

  it('prints `Importované` in the one format this application prints', () => {
    expect(flightTableRow(entry).created_at).toBe('16.08.2026')
  })

  it('renders no max-distance column, though the flight carries the figure', () => {
    // doc 04 lists no column for it. it exists because the VLOS violation is judged on it,
    // and that derivation is the operator report's - docs/specs/06-org-report.md
    expect(flightTable.columns.map((column) => column.key)).not.toContain('max_distance')
    expect(entry.maxDistanceMeters).not.toBe(entry.totalDistanceMeters)
  })
})
