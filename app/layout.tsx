import type { Metadata, Viewport } from 'next'
import { Instrument_Serif, Inter } from 'next/font/google'
import { ServiceWorker } from '@/components/ServiceWorker'
import { appName } from '@/lib/env'
import './globals.css'

const displaySerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display-serif',
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
  themeColor: '#0a0908',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displaySerif.variable} ${bodySans.variable}`}>
      <body className="grain vignette min-h-dvh bg-ink text-paper antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
