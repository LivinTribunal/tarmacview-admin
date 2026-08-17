import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { readGeneralDocumentFile } from '@/lib/files/general-document'
import { identifier } from '@/lib/routes/identifier'
import { withTenant } from '@/lib/tenant/tenant-context'

// the second file this application serves, and it serves it the one way
// docs/specs/03-data-model.md §"Serving a stored file in the rebuild" allows - the shape
// src/app/api/organizations/[id]/logo/route.ts established, and the section says the
// document buckets copy. it takes a document id and nothing else: no path, no filename, no
// extension, and no organisation, because a global document belongs to none.
//
// what changes for the global library is only which sessions the read answers for. what
// does not change is that the row is read first, inside the tenant transaction, and that
// the refusal below is a resolved session or nothing - src/middleware.ts does not cover
// /api and only ever saw a cookie anyway.

// one not-found for every refusal, so none of them confirms that a row exists
const notFound = () => new Response(null, { status: 404 })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await actingSession()
  if (!session) return notFound()

  const id = identifier((await params).id)
  if (id === null) return notFound()

  const file = await withTenant(db, session, (tx) => readGeneralDocumentFile(tx, id))
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
      // every row this route reaches is global, so the logo's reason - one operator's
      // bytes in a cache another operator reads - is not this one's. the response is still
      // only ever served to a resolved session, and a shared cache holding it is the
      // static path the section above exists to refuse.
      'cache-control': 'private',
    },
  })
}
