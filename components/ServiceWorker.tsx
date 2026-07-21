'use client'

import { useEffect } from 'react'

/** Registers the service worker, quietly, once the page has settled. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // An archive that works is more important than one that works offline.
      })
    }

    // Don't compete with the first render for bandwidth.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
