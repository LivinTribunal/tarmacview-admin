import { readDocumentFile } from '@/lib/files/document'
import { serveStoredFile } from '@/lib/routes/stored-file'

// every bucket of `document` - docs/specs/03-data-model.md §"Serving a stored file in the
// rebuild", which #75 corrected to say that one route per *table* is what that section asks
// for and one route per *register* is not. it takes a document id and nothing else: no path,
// no filename, no extension, no bucket and no organisation, because the row carries all of
// them.
//
// the handler itself is src/lib/routes/stored-file.ts, shared with the two routes beside it.
// what stays here is which table this path reads, which is the only thing about it that is
// this route's own.
export const GET = serveStoredFile(readDocumentFile)
