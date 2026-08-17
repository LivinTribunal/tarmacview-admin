import { notFound, redirect } from 'next/navigation'
import { IndexTable } from '@/components/index-table'
import { actingSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { activeTabIndex, workspaceTabs } from '@/lib/organizations/workspace'
import { identifier } from '@/lib/routes/identifier'
import { findOrganization } from '@/lib/tenant/scoped-organizations'
import { withTenant } from '@/lib/tenant/tenant-context'

// the organisation workspace - docs/specs/05-organization-workspace.md, the screen doc 05
// calls the operator's compliance file. which tabs are built is stated once, in
// src/lib/organizations/workspace.ts beside the tab table itself.
//
// the directory is `[org]` and not `[id]`, unlike every sibling register. the oracle spells
// the path `/admin/organizations/{org}/edit` and tests/contracts/routes.test.ts maps a
// `[segment]` directory to `{segment}`, so the oracle's spelling is the directory's name -
// the oracle is never edited to agree with us.
//
// no branch here asks whether the session is allowed. `findOrganization` returns no row for
// an organisation they hold no membership of, and a page with nothing to render is
// not-found - the same shape the two file routes already use, and the reason refusing would
// be worse: it would confirm the organisation is real.
//
// the organisation form doc 04 owns sits at the top of this screen in the predecessor. it
// is not here yet; it needs a write path to submit to.
export default async function OrganizationWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await actingSession()

  // the middleware only saw a cookie. a cookie that no longer resolves to a person is
  // an anonymous visitor as far as this page is concerned.
  if (!session) redirect('/login')

  const id = identifier((await params).org)
  if (id === null) notFound()

  // absent or unparseable opens tab 0; out of range is not-found rather than a fallback -
  // src/lib/organizations/workspace.ts holds the reason
  const active = activeTabIndex((await searchParams).activeRelationManager)
  const tab = active === null ? undefined : workspaceTabs[active]
  if (!tab) notFound()

  // one transaction, and inside it exactly one register read: the tab that was asked for.
  // doc 05 says the tabs "load lazily - each is fetched only when opened", and this is that
  // behaviour rather than its mechanism. the predecessor fetched on click; a server-rendered
  // page runs one query per request, and six loaders are never awaited.
  const opened = await withTenant(db, session, async (tx) => {
    const organization = await findOrganization(tx, id)
    if (!organization) return null
    return { organization, rows: tab.register ? await tab.register.load(tx, organization.id) : null }
  })
  if (!opened) notFound()

  return (
    <main>
      <h1>{t('organization.workspace.title', { name: opened.organization.name })}</h1>
      <nav>
        {workspaceTabs.map((entry, index) => (
          <a
            key={entry.labelKey}
            href={`?activeRelationManager=${index}`}
            aria-current={index === active ? 'page' : undefined}
          >
            {t(entry.labelKey)}
          </a>
        ))}
      </nav>
      {tab.register && opened.rows !== null && (
        <IndexTable declaration={tab.register.declaration} rows={opened.rows} />
      )}
    </main>
  )
}
