import { readDocumentFile } from '@/lib/files/document'
import { serveStoredFile } from '@/lib/routes/stored-file'

// one of the three download paths `contracts/routes.json` carries under the operator report,
// and a **mount** of the handler `/api/documents/{id}/file` already serves rather than a
// fourth one - docs/specs/03-data-model.md §"Serving a stored file in the rebuild", which
// counts handlers carrying guards and not paths.
//
// the `{org}` segment is the report's address and is not read here. what decides which rows
// this path can reach is `document_tenant_isolation`, and doc 06 §"The documents panel in the
// rebuild" records that as a stated cost: a selection on the path's organisation and bucket
// would answer the cross-tenant case on its own, and the isolation assertion would then pass
// with the policy dropped.
export const GET = serveStoredFile(readDocumentFile)
