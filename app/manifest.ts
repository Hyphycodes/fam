import type { MetadataRoute } from 'next'
import { appName } from '@/lib/env'

/** Generated rather than static so renaming the app is still one env var. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    description: 'A private place for our photos and videos.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0908',
    theme_color: '#0a0908',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
