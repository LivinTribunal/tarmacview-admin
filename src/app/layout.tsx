import type { ReactNode } from 'react'
import { defaultLocale } from '@/lib/i18n'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>{children}</body>
    </html>
  )
}
