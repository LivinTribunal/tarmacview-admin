import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { readOrganizationLogo } from '@/lib/files/organization-logo'
import { withTenant } from '@/lib/tenant/tenant-context'

// the first thing in the rebuild that serves a file, and it serves it the one way
// docs/specs/03-data-model.md §"Serving a stored file in the rebuild" allows: the owning
// row is resolved inside the tenant transaction first, and the bytes follow only if that
// read returned one. it takes an organisation id and nothing else - no path, no filename,
// no extension - and it is nested under the resource that owns the file, because a generic
// file route is the shape that invites a handler taking a path.
//
// src/middleware.ts does not cover /api and must not be what stops an anonymous request:
// it reads the presence of a session cookie and nothing more. the refusal below is a
// resolved session or nothing.

// one not-found for every refusal, so none of them confirms that a row exists
const notFound = () => new Response(null, { status: 404 })

// only a plain decimal id reaches the read. Number() alone would take `1e3` and ` 1 `, and
// a value past int4 raises out of range inside the query rather than answering.
const identifier = (id: string): number | null => (/^\d{1,9}$/.test(id) ? Number(id) : null)

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await actingSession()
  if (!session) return notFound()

  const id = identifier((await params).id)
  if (id === null) return notFound()

  const logo = await withTenant(db, session, (tx) => readOrganizationLogo(tx, id))
  if (!logo) return notFound()

  // Response takes a view over its own buffer and readFile hands back one over node's
  // shared pool, so the bytes are copied out of it rather than cast across the difference
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      'content-type': logo.contentType,
      // the response is tenant-scoped, so a shared cache holding it would hand one
      // operator's logo to another. `private` is the floor here, not a tuning decision.
      'cache-control': 'private',
    },
  })
}
