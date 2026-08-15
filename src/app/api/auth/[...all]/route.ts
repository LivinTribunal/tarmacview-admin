import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

// sign-in and sign-out. sign-up and self-service reset are disabled in the auth config,
// so this handler serves neither - and the route suite now walks route.ts as well as
// page.tsx, so an api handler cannot quietly restore one of the paths the absent lock
// in contracts/routes.json holds shut.
export const { GET, POST } = toNextJsHandler(auth)
