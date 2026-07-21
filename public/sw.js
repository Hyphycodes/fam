/* eslint-disable no-undef */

/**
 * Service worker.
 *
 * The interesting part: media arrives on signed URLs whose query string changes
 * on every page load, so caching by full URL would never hit. We strip the
 * signature and cache by path instead — which is what actually makes
 * "already-loaded memories still work on the plane" true.
 */

const VERSION = 'reel-v1'
const SHELL = `${VERSION}-shell`
const MEDIA = `${VERSION}-media`

/** Hosts that serve family media on signed, ever-changing URLs. */
function isMedia(url) {
  return (
    url.hostname.endsWith('.r2.cloudflarestorage.com') ||
    url.hostname.endsWith('.cloudflarestream.com')
  )
}

/** Same object, different signature — key on the path alone. */
function mediaKey(url) {
  return `${url.origin}${url.pathname}`
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/offline', '/icons/icon.svg'])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Media: serve from cache instantly, refresh in the background.
  if (isMedia(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA)
        const key = mediaKey(url)
        const hit = await cache.match(key)

        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(key, response.clone())
            return response
          })
          .catch(() => null)

        // A cached photo now beats a fresh one in 400ms.
        return hit ?? (await network) ?? new Response('', { status: 504 })
      })(),
    )
    return
  }

  // Never cache the API — these answers are per-person and per-moment.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // Pages: try the network, fall back to whatever we last saw.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          const cache = await caches.open(SHELL)
          cache.put(request, response.clone())
          return response
        } catch {
          const cache = await caches.open(SHELL)
          return (
            (await cache.match(request)) ??
            (await cache.match('/offline')) ??
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          )
        }
      })(),
    )
    return
  }

  // Next's build output is content-hashed, so cache-first is always safe.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
  }
})
