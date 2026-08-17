import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { readDocumentFile } from '@/lib/files/document'
import { identifier } from '@/lib/routes/identifier'
import { withTenant } from '@/lib/tenant/tenant-context'

// the second file this application serves, and the last one it needs for `document` -
// docs/specs/03-data-model.md §"Serving a stored file in the rebuild", which #75 corrected
// to say that one route per *table* is what that section asks for and one route per
// *register* is not. it takes a document id and nothing else: no path, no filename, no
// extension, no bucket, and no organisation, because the row carries all of them.
//
// one route rather than five, so the four guards below are enforced in one place - #63.
//
// what does not change is that the row is read first, inside the tenant transaction, and
// that the refusal below is a resolved session or nothing - src/middleware.ts does not cover
// /api and only ever saw a cookie anyway.

// one not-found for every refusal, so none of them confirms that a row exists
const notFound = () => new Response(null, { status: 404 })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await actingSession()
  if (!session) return notFound()

  const id = identifier((await params).id)
  if (id === null) return notFound()

  const file = await withTenant(db, session, (tx) => readDocumentFile(tx, id))
  if (!file) return notFound()

  // Response takes a view over its own buffer and readFile hands back one over node's
  // shared pool, so the bytes are copied out of it rather than cast across the difference
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': file.contentType,
      // the allow-list is on the extension and never on the contents, and this route's
      // list takes `.doc` and `.pdf`, where a browser sniffing past the type has livelier
      // things to find than it does under an image. nosniff makes the type binding rather
      // than advisory, which is what the allow-list was relying on all along.
      'x-content-type-options': 'nosniff',
      // one route now reaches an operator's own buckets as well as the global library, so
      // the logo's reason - one operator's bytes in a cache another operator reads - is
      // this one's too, and no longer only by analogy. the response is served to a resolved
      // session either way, and a shared cache holding it is the static path the section
      // above exists to refuse.
      'cache-control': 'private',
    },
  })
}
