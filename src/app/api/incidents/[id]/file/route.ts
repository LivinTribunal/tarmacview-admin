import { readIncidentFile } from '@/lib/files/incident'
import { serveStoredFile } from '@/lib/routes/stored-file'

// the file attached to one occurrence report - docs/specs/03-data-model.md §"Serving a
// stored file in the rebuild", and its §"Incidents in the rebuild" for why this is a route
// of its own rather than a fourth `document` bucket: `incident.file_path` is its own column
// on its own table, and one route per table is what #75 settled.
//
// the handler itself is src/lib/routes/stored-file.ts, shared with the two routes beside it;
// what stays here is which table this path reads.
export const GET = serveStoredFile(readIncidentFile)
