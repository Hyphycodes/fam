import 'server-only'

import type { DB } from '@/lib/api'
import { appleMusic } from '@/lib/community/providers/appleMusic'
import type { SoundtrackProvider, SoundtrackView } from '@/lib/types'

/**
 * The provider seam. Every provider-specific piece of logic lives behind this
 * interface, and the registry below is the only place they're wired in. Adding
 * Spotify means writing one provider file and adding it to PROVIDERS — the
 * routes, the card, and the schema never change.
 */
export interface PlaylistMeta {
  title: string | null
  artworkUrl: string | null
  trackCount: number | null
}

export interface PlaylistProvider {
  id: SoundtrackProvider
  /** Does this provider own this URL? */
  matches(url: string): boolean
  /** Pull the stable external id out of the URL, if it has one. */
  parse(url: string): { externalId: string | null } | null
  /** Resolve title/artwork/track-count, or null to fall through to manual entry. */
  fetchMeta(url: string, externalId: string | null): Promise<PlaylistMeta | null>
}

// The registry. One line per provider — this is what "adding Spotify is one
// file and one entry" means.
export const PROVIDERS: PlaylistProvider[] = [appleMusic]

export function resolveProvider(url: string): PlaylistProvider | null {
  return PROVIDERS.find((provider) => provider.matches(url)) ?? null
}

export async function getSoundtrack(db: DB, eventId: string): Promise<SoundtrackView | null> {
  // One per event by convention; take the earliest if somehow more exist.
  const { data } = await db
    .from('event_soundtracks')
    .select('id, event_id, provider, external_url, title, artwork_url, track_count')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as SoundtrackView | null) ?? null
}
