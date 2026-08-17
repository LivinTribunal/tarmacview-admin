import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import type { StoredFile } from '@/lib/files/storage'
import { identifier } from '@/lib/routes/identifier'
import { withTenant, type TenantTransaction } from '@/lib/tenant/tenant-context'

// the handler docs/specs/03-data-model.md §"Serving a stored file in the rebuild" describes,
// written once. it takes a **reader** and nothing else: a row id, resolved inside the tenant
// transaction by a function that knows one table, and the bytes only if that read returned
// something.
//
// stated once rather than per route, for the reason identifier.ts gives beside it - three
// copies of a rule is three places for one of them to drift, and the one that drifts is the
// one nobody rereads. #63 is the issue and #75 is the evidence: the last consolidation
// dropped a guard on one of two readers and every test stayed green, because both readers
// having been written alike was being treated as coverage. it is not.
//
// two of the four guards are here - `nosniff` and `Cache-Control: private`, which are
// properties of the *response*. the other two are properties of the *path*, so they sit in
// src/lib/files/storage.ts where the path is resolved.
//
// src/middleware.ts does not cover /api and must not be what stops an anonymous request: it
// reads the presence of a session cookie and nothing more. the refusal below is a resolved
// session or nothing.
type StoredFileReader = (tx: TenantTransaction, id: number) => Promise<StoredFile | null>

// one not-found for every refusal, so none of them confirms that a row exists
const notFound = () => new Response(null, { status: 404 })

export function serveStoredFile(read: StoredFileReader) {
  return async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const session = await actingSession()
    if (!session) return notFound()

    const id = identifier((await params).id)
    if (id === null) return notFound()

    const file = await withTenant(db, session, (tx) => read(tx, id))
    if (!file) return notFound()

    // Response takes a view over its own buffer and readFile hands back one over node's
    // shared pool, so the bytes are copied out of it rather than cast across the difference
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'content-type': file.contentType,

        // the allow-list is on the extension and never on the contents, so a file named
        // `.png` holding markup is served as an image under a content type the browser is
        // otherwise free to sniff past and execute in this origin, with the session cookie
        // in scope. nosniff makes the type binding rather than advisory, which is what the
        // allow-list was relying on all along - and two of the three lists take `.doc` and
        // `.pdf`, where what sniffing finds is livelier still.
        'x-content-type-options': 'nosniff',

        // every response here is scoped to one resolved session, so a shared cache holding
        // one would hand one operator's bytes to another operator's request. `private` is
        // the floor, not a tuning decision.
        'cache-control': 'private',
      },
    })
  }
}
