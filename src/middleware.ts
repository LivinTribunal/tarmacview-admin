import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

// which paths need a session, matching the auth expectation each route carries in
// contracts/routes.json: /admin/*, /organization-reports/* and / are session routes,
// /map/* serves anonymously and stays that way, and the auth endpoints must be
// reachable without a session or nobody could ever sign in.
export function requiresSession(pathname: string): boolean {
  if (pathname.startsWith('/api/auth')) return false
  return (
    pathname === '/' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/organization-reports')
  )
}

// this is the redirect for anonymous visitors, not the authorisation boundary. it reads
// the presence of a session cookie and nothing more; what a session may actually see is
// decided by row-level security and the capability matrix, both server-side on every
// query.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!requiresSession(pathname)) return NextResponse.next()
  if (getSessionCookie(request)) return NextResponse.next()

  const login = new URL('/login', request.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/', '/admin/:path*', '/organization-reports/:path*'],
}
