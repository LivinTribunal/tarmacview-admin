import type { ReactNode } from 'react'
import { SignOutForm } from '@/components/sign-out-form'

// the sign-out control belongs to the whole signed-in admin surface, so it is rendered
// once here rather than repeated down thirteen registers as they land.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header>
        <SignOutForm />
      </header>
      {children}
    </>
  )
}
