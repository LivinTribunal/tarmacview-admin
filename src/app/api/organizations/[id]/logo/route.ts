import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { readOrganizationLogo } from '@/lib/files/organization-logo'
import { identifier } from '@/lib/routes/identifier'
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
      // the allow-list is on the extension and never on the contents, so a file named
      // `.png` holding markup is served as an image by a content type the browser is
      // otherwise free to sniff past and execute here. nosniff makes the type binding
      // rather than advisory, which is what the allow-list was relying on all along.
      'x-content-type-options': 'nosniff',
      // the response is tenant-scoped, so a shared cache holding it would hand one
      // operator's logo to another. `private` is the floor here, not a tuning decision.
      'cache-control': 'private',
    },
  })
}
