import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ServiceWorker } from '@/components/ServiceWorker'
import { appName } from '@/lib/env'
import './globals.css'

// One clean grotesk carries the whole interface; weight does the talking.
const bodySans = Geist({
  subsets: ['latin'],
  variable: '--font-body-sans',
  display: 'swap',
})

// Reserved for tiny metadata — dates, timecodes, counters.
const metaMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-meta-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: appName,
  description: 'A private place for our photos and videos.',
  applicationName: appName,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: appName, statusBarStyle: 'black-translucent' },
  // A family archive should never show up in a search result.
  robots: { index: false, follow: false },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodySans.variable} ${metaMono.variable}`}>
      <body className="min-h-dvh bg-ink text-paper antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
