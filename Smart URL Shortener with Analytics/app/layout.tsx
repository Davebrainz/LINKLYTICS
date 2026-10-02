import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../src/index.css'
import '../src/App.css'

export const metadata: Metadata = {
  title: 'Linklytics | Smart URL Shortener',
  description: 'Shorten, share, and understand your URLs from one workspace.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}