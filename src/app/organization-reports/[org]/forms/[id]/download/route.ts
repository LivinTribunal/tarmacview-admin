import { readDocumentFile } from '@/lib/files/document'
import { serveStoredFile } from '@/lib/routes/stored-file'

// the forms bucket's oracle path, and the same mount as the two beside it - one route per
// table is what docs/specs/03-data-model.md §"Serving a stored file in the rebuild" counts,
// and all three of these read `document`.
export const GET = serveStoredFile(readDocumentFile)
