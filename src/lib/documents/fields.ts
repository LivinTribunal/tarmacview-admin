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

// the one route that serves a stored document, of any bucket - docs/specs/03-data-model.md
// §"Serving a stored file in the rebuild". four declarations state it now, which is the
// whole of what #75 consolidated: a path shape written once cannot be written four
// different ways.
const documentFilePath = '/api/documents/{id}/file'

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
//
// `Upraviť` is offered only to a session that could complete it, which is why this is a
// function - the shape the people and maps registers use, and mayManageGlobalDocuments in
// src/lib/auth/capabilities.ts holds why.
export function generalDocumentTable(mayManage: boolean): TableDeclaration {
  return {
    resource: 'general-documents',
    emptyKey: 'document.index.empty',
    editPath: mayManage ? '/admin/general-documents/{id}/edit' : undefined,
    columns: [
      { key: 'name', labelKey: 'document.column.name', sortable: true },
      { key: 'file', labelKey: 'document.field.file_path' },
      { key: 'link', labelKey: 'document.column.link', linkPath: documentFilePath },
      { key: 'size', labelKey: 'document.column.size', sortable: true },
      { key: 'category', labelKey: 'document.column.category' },
      { key: 'valid_until', labelKey: 'document.field.valid_until', sortable: true },
      { key: 'uploaded_by', labelKey: 'document.column.uploaded_by', sortable: true },
      { key: 'created_at', labelKey: 'document.column.created_at', hiddenByDefault: true },
    ],
  }
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

// the workspace's three document buckets - docs/specs/05-organization-workspace.md §3, §4
// and §5. filed here rather than in a module of their own because they are the register
// above's own entity in three more registers, which is why src/lib/users/fields.ts holds the
// workspace's people tables beside the deployment-wide one.
//
// **three declarations and not one over a bucket constant.** §4 is not shaped like the other
// two: it carries `Verejné`, which no other bucket has, and its first column is the filename
// rather than the name - doc 03 §Document's *required (except permits, which take the
// filename)*, and doc 05 §4's own *"The filename will be used as the permit name"*. one
// shared declaration would either hide `Verejné` or invent it for the other two. what is
// genuinely shared is the read, and that is scoped-documents.ts's `listOrganizationDocuments`.
//
// §3 and §5 do agree, column for column, and are still written out twice: the two lists have
// different provenance. §5's is Observed; §3's the doc records as *not observed - the
// register was empty for the inspected organisation*, so it is **inferred** and marked so
// below. one shared array would let a later correction to the inferred list silently rewrite
// the observed one.
//
// none of the three declares a filter, a row action or a bulk action, the same absence
// `airframeTable` and the two people tables state: doc 05 records `Stiahnuť`, `Upraviť`,
// `Odstrániť`, the bulk removals and §4's `Verejné` filter, all Observed from a GET-only
// capture. the filter is deferred with the filter panel - doc 05 §"The workspace in the
// rebuild" says why it is the natural first one - and the rest are writes with no write path.
// `Stiahnuť` alone is a **read**, so it is served: the filename cell links to the file route
// the way `Odkaz` does above, and the row id is still the only thing that reaches the url.
//
// `Nahrané` is a plain column here and *(toggle)* on the register above. that is doc 05's
// tab table against doc 04's, not an inconsistency to tidy away.

// §3, and the column list is *(inferred)*: doc 05 records the register as empty for the
// inspected organisation and assumes the document shape.
export const organizationFormTable: TableDeclaration = {
  resource: 'organization-forms',
  emptyKey: 'organization.workspace.forms.empty',
  columns: [
    { key: 'name', labelKey: 'document.column.name' },
    { key: 'file', labelKey: 'document.field.file_path', linkPath: documentFilePath },
    { key: 'size', labelKey: 'document.column.size' },
    { key: 'uploaded_by', labelKey: 'document.column.uploaded_by' },
    { key: 'created_at', labelKey: 'document.column.created_at' },
  ],
}

// §4, Observed. `Názov súboru` and not `Názov`, and `Verejné` between it and `Veľkosť`.
export const organizationPermitTable: TableDeclaration = {
  resource: 'organization-permits',
  emptyKey: 'organization.workspace.permits.empty',
  columns: [
    { key: 'file', labelKey: 'document.column.file_name', linkPath: documentFilePath },
    { key: 'is_public', labelKey: 'document.column.is_public' },
    { key: 'size', labelKey: 'document.column.size' },
    { key: 'uploaded_by', labelKey: 'document.column.uploaded_by' },
    { key: 'created_at', labelKey: 'document.column.created_at' },
  ],
}

// §5, Observed - the operator's standing compliance pack.
export const organizationOperationsTable: TableDeclaration = {
  resource: 'organization-operations',
  emptyKey: 'organization.workspace.operations.empty',
  columns: [
    { key: 'name', labelKey: 'document.column.name' },
    { key: 'file', labelKey: 'document.field.file_path', linkPath: documentFilePath },
    { key: 'size', labelKey: 'document.column.size' },
    { key: 'uploaded_by', labelKey: 'document.column.uploaded_by' },
    { key: 'created_at', labelKey: 'document.column.created_at' },
  ],
}

// tab 3. `Súbor` carries the file's own name and never the path it sits at, the narrower rule
// `generalDocumentTableRow` states above and for the same reason.
//
// `Nahral` is a gap wherever the session cannot read the uploader. that is the *normal* case
// for the global library, whose uploader is a superadmin no member shares an organisation
// with; here the uploader is usually one of the operator's own people, so a gap on these
// tabs means the document names nobody - and it is still a gap and never a pass.
export function organizationFormTableRow(entry: DocumentEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    file: basename(entry.filePath),
    size: fileSize(entry.size),
    uploaded_by: entry.uploadedByName,
    created_at: formatDate(entry.createdAt),
  }
}

// tab 5, and its own function rather than tab 3's: the two declarations are separate because
// §3's column list is inferred and §5's is Observed, and one shared row function would put
// back exactly the coupling that split exists to prevent - a correction to the inferred cells
// silently rewriting the observed ones. src/lib/users/fields.ts writes one per declaration for
// its two overlapping tabs on the same reasoning.
export function organizationOperationsTableRow(entry: DocumentEntry): TableRow {
  return {
    id: entry.id,
    name: entry.name,
    file: basename(entry.filePath),
    size: fileSize(entry.size),
    uploaded_by: entry.uploadedByName,
    created_at: formatDate(entry.createdAt),
  }
}

// and tab 4. no `name` cell: a permit's name *is* its filename, so a second cell repeating
// it would state a distinction the bucket does not have.
//
// `Verejné` states the affirmative and says nothing where the flag is clear - the shape
// `organizationPersonTableRow`'s `Hlavná` uses and for the reason stated there, plus one of
// its own: it puts the word on the rows that carry the exposure rather than on the rows that
// do not.
//
// whether a public permit is exposed to a session-less reader at all is doc 06's to settle -
// doc 05 §4 flags the predecessor's own wording against the report's, and this cell shows
// the flag without resolving any of it.
export function organizationPermitTableRow(entry: DocumentEntry): TableRow {
  return {
    id: entry.id,
    file: basename(entry.filePath),
    is_public: entry.isPublic ? t('document.isPublic.yes') : null,
    size: fileSize(entry.size),
    uploaded_by: entry.uploadedByName,
    created_at: formatDate(entry.createdAt),
  }
}
