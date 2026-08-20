import { readDocumentFile } from '@/lib/files/document'
import { serveStoredFile } from '@/lib/routes/stored-file'

// the permits bucket's oracle path, and the same mount as the two beside it.
//
// `is_public` is not consulted, here or in the reader: doc 06 §"Documents panel" decides that
// the permits group lists every permit the organisation holds, and doc 03 §Document keeps a
// public read an explicit opt-in on a handler that has no branch for one.
export const GET = serveStoredFile(readDocumentFile)
