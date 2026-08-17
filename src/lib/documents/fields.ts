import { basename } from 'node:path'
import type { FormField } from '@/lib/form/fields'
import { formatDate, t } from '@/lib/i18n'
import type { TableDeclaration, TableRow } from '@/lib/table/view'
import type { DocumentEntry } from '@/lib/tenant/scoped-documents'

// the global document form declared once, rendered by both create and edit.
// contracts/forms/general-documents.json is the oracle for this list and it is the whole
// form: three fields, the same set on create and on edit.
//
// the field order is doc 04 §OrganizationDocumentResource's form line, which puts `Názov`
// before `Súbor` where the capture's markup has them the other way round. neither is a
// claim about validation.
//
// `Súbor` carries no `required` attribute, and doc 04's prose calling it required is
// honoured where it belongs: `document.file_path` is `not null`. the capture records the
// attribute on neither create nor edit, and a file input marked required on an edit form
// would demand a fresh upload to save a changed note.
export const generalDocumentFormFields: readonly FormField[] = [
  {
    name: 'name',
    control: 'input',
    labelKey: 'document.field.name',
    type: 'text',
    required: true,
    maxlength: 255,
  },
  {
    name: 'file_path',
    control: 'input',
    labelKey: 'document.field.file_path',
    type: 'file',
  },
  {
    name: 'note',
    control: 'textarea',
    labelKey: 'document.field.note',
    rows: 3,
  },
]

// docs/specs/04-admin-resources.md §OrganizationDocumentResource is the source: eight
// columns, of which `Súbor`, `Odkaz` and `Kategória` carry no `^` and so are not sortable.
// the one column doc 04 marks *(toggle)* is `created_at`, which is last here and is neither
// sortable nor shown until a reader enables it. this is also the one register in doc 04 that
// lists no `ID` column at all, so there is none here either - the row id is still what the
// actions link and the file route are keyed on.
//
// `Odkaz` is the link that fetches the file, *(inferred)* - doc 04 lists it beside `Súbor`
// and doc 03 §Document has no url column, so the two are the stored name and the way to
// reach it. it declares a `linkPath` the way `Logo` declares an `imagePath`, on the terms
// src/lib/table/view.ts sets for both.
//
// no filters and no bulk action, following all six siblings - doc 04 records `Odstrániť
// vybrané`, the capture was GET-only, and a checkbox wired to nothing is worse than no
// checkbox.
export const generalDocumentTable: TableDeclaration = {
  resource: 'general-documents',
  emptyKey: 'document.index.empty',
  editPath: '/admin/general-documents/{id}/edit',
  columns: [
    { key: 'name', labelKey: 'document.column.name', sortable: true },
    { key: 'file', labelKey: 'document.field.file_path' },
    {
      key: 'link',
      labelKey: 'document.column.link',
      linkPath: '/api/general-documents/{id}/file',
    },
    { key: 'size', labelKey: 'document.column.size', sortable: true },
    { key: 'category', labelKey: 'document.column.category' },
    { key: 'valid_until', labelKey: 'document.field.valid_until', sortable: true },
    { key: 'uploaded_by', labelKey: 'document.column.uploaded_by', sortable: true },
    { key: 'created_at', labelKey: 'document.column.created_at', hiddenByDefault: true },
  ],
}

// `size` is bytes on the row and human-readable in the cell - doc 03 §Document. SI steps,
// so the `kB` and `MB` the labels carry mean what they say.
//
// the decimal comma is applied here and not by formatCell, because a figure with a unit on
// it is a string by the time the chrome sees it. that leaves `Veľkosť` sorting as text, the
// ceiling `Čas letu` and every date column already carry: a formatted cell is the only
// value the row holds, and giving the chrome a separate sort value per cell is a change to
// every register rather than to this one.
function fileSize(bytes: number | null): string | null {
  if (bytes === null) return null
  if (bytes < 1000) return t('document.size.bytes', { value: bytes })

  const kilobytes = bytes / 1000
  const scale = (value: number) => value.toFixed(1).replace('.', ',')

  return kilobytes < 1000
    ? t('document.size.kilobytes', { value: scale(kilobytes) })
    : t('document.size.megabytes', { value: scale(kilobytes / 1000) })
}

// flattens a document into the record the chrome renders.
//
// `Platnosť do` blank is a **gap** and never an expiry that passed - docs/specs/03-data-model.md
// §"The global document library in the rebuild". deliberately not `training.valid_until`'s
// *Bez expirácie*: claiming never-expires for a document nobody recorded an expiry for is the
// same mistake in the other direction.
//
// `Súbor` carries the file's own name and never the path it sits at. that is a narrower rule
// than `Logo`'s, which keeps the stored value off the register entirely - but doc 04 asks for
// this column and doc 03 reads it as the stored filename, so the directory layout is what
// must not reach the browser rather than the name. when the write path generates storage
// names (#56 deferred them), the uploaded name becomes a column of its own and this cell
// reads that instead.
//
// `Kategória` resolves through the catalogue rather than printing the enum, so every row of
// this register carries the same bucket in the reader's own language.
export function generalDocumentTableRow(entry: DocumentEntry): TableRow {
  return {
    // no `ID` column, but the row still carries its id: it is the actions link's subject
    // and the `{id}` the file route is reached by
    id: entry.id,
    name: entry.name,
    file: basename(entry.filePath),
    link: t('document.action.download'),
    size: fileSize(entry.size),
    category: t(`document.category.${entry.category}`),
    valid_until: formatDate(entry.validUntil),
    uploaded_by: entry.uploadedByName,
    created_at: formatDate(entry.createdAt),
  }
}
