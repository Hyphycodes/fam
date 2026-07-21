import type { Metadata, Viewport } from 'next'
import { Caveat, Inter, VT323 } from 'next/font/google'
import { ServiceWorker } from '@/components/ServiceWorker'
import { appName } from '@/lib/env'
import './globals.css'

// The camcorder's on-screen display — dates, counts, controls, headlines.
const osdPixel = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-osd-pixel',
  display: 'swap',
})

// Marker on the tape label — captions written by a human hand.
const handScript = Caveat({
  subsets: ['latin'],
  variable: '--font-hand-script',
  display: 'swap',
})

const bodySans = Inter({
  subsets: ['latin'],
  variable: '--font-body-sans',
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
  themeColor: '#0d0a06',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${osdPixel.variable} ${handScript.variable} ${bodySans.variable}`}>
      <body className="grain vignette min-h-dvh bg-ink text-paper antialiased">
        {children}
        <div className="crt-overlay" aria-hidden="true" />
        <ServiceWorker />
      </body>
    </html>
  )
}
