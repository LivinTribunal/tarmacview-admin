import { readOrganizationLogo } from '@/lib/files/organization-logo'
import { serveStoredFile } from '@/lib/routes/stored-file'

// the first thing in the rebuild that served a file, and it serves it the one way
// docs/specs/03-data-model.md §"Serving a stored file in the rebuild" allows. it takes an
// organisation id and nothing else - no path, no filename, no extension - and it is nested
// under the resource that owns the file, because a generic file route is the shape that
// invites a handler taking a path.
//
// the handler itself is src/lib/routes/stored-file.ts, shared with the two routes beside it.
export const GET = serveStoredFile(readOrganizationLogo)
