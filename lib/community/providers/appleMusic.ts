import 'server-only'

import type { PlaylistProvider } from '@/lib/community/soundtrack'

/**
 * Apple Music playlists. Metadata comes from the page's Open Graph tags — Apple
 * has no public playlist API — so title and artwork resolve reliably and track
 * count is best-effort from the description. A miss falls through to manual
 * entry in the UI; a broken card is worse than a hand-typed one.
 *
 * This is the entire provider. Adding Spotify is a sibling file plus one line in
 * the PROVIDERS array in ../soundtrack.ts — nothing else.
 */
export const appleMusic: PlaylistProvider = {
  id: 'apple_music',

  matches(url) {
    return /^https?:\/\/(embed\.)?music\.apple\.com\/[^/]+\/playlist\//i.test(url.trim())
  },

  parse(url) {
    const match = url.match(/\/playlist\/[^/]+\/(pl\.[a-z0-9-]+)/i)
    return { externalId: match?.[1] ?? null }
  },

  async fetchMeta(url) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; ReelBot/1.0; +family-archive)' },
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) return null
      const html = (await response.text()).slice(0, 300_000)

      const og = (property: string) =>
        html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, 'i'))?.[1]

      const title = og('title')
      const artworkUrl = og('image')
      const description = og('description') ?? ''
      const count = description.match(/(\d[\d,]*)\s+songs?/i)?.[1]
      const trackCount = count ? Number(count.replace(/,/g, '')) : null

      if (!title && !artworkUrl) return null
      return {
        title: title ? decodeEntities(title).trim().slice(0, 200) : null,
        artworkUrl: artworkUrl ?? null,
        trackCount: Number.isFinite(trackCount) ? trackCount : null,
      }
    } catch {
      return null
    }
  },
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}
