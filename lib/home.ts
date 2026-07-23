import 'server-only'

import type { DB } from '@/lib/api'
import { getBoardEvents } from '@/lib/community/events'
import { getFeed, getOnThisDay, getYears } from '@/lib/queries'
import { dailyIndex } from '@/lib/format'
import { presignGet } from '@/lib/r2'
import { isConfigured } from '@/lib/env'
import type { BoardEvent, MediaView } from '@/lib/types'

/**
 * The front door's data, assembled with two rules that matter more than any
 * rail:
 *
 *   1. Global de-dup. A memory shown in one section is ineligible for the
 *      sections below it, walked top to bottom in render order — so nothing
 *      appears twice on one page.
 *   2. Graceful thinness. A media rail with fewer than two fresh items hides
 *      itself. Fewer, fuller rails; the page gets denser as the archive grows
 *      instead of repeating harder when it's sparse.
 *
 * A handful of parallel reads, not eight independent fetches.
 */

export interface HomeData {
  /** The server's first-paint pick (stable within a day) — the SSR frame. */
  featured: MediaView | null
  /** The weighted candidate set the client rotates through, never repeating. */
  featuredPool: MediaView[]
  onThisDay: MediaView[]
  comingUp: BoardEvent[]
  jumpBack: { year: number; count: number }[]
  recentlyAdded: MediaView[]
  hasMedia: boolean
  /** Real covers for the Collections tiles, so none of them renders grey. */
  collections: {
    /** Up to four recent photo thumbs — a mosaic that says "many". */
    photos: string[]
    /** The most recent video's poster. */
    video: string | null
    /** The most recent flyer. */
    artifact: string | null
  }
}

const FEATURED_POOL_SIZE = 16

function thumbOf(media: MediaView): string | null {
  return media.thumb_url ?? media.display_url
}

/** The most recent flyer (or scanned doc), presigned — the Artifacts tile's cover. */
async function recentFlyer(db: DB): Promise<string | null> {
  if (!isConfigured('r2')) return null
  const { data } = await db
    .from('event_artifacts')
    .select('storage_key, type')
    .in('type', ['flyer', 'image_doc'])
    .not('storage_key', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const key = (data ?? [])[0]?.storage_key as string | undefined
  return key ? presignGet(key) : null
}

const highPrecision = (media: MediaView) =>
  media.taken_precision === 'exact' || media.taken_precision === 'day'

function uniqueById(items: MediaView[]): MediaView[] {
  const seen = new Set<string>()
  const out: MediaView[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export async function getHomeData(db: DB): Promise<HomeData> {
  const [onThisDayPool, recentPool, planned, years, artifact] = await Promise.all([
    getOnThisDay(db), // already excludes approximate dates
    getFeed(db, { limit: 96, order: 'newest' }),
    getBoardEvents(db), // planned events (the Board holds the future)
    getYears(db),
    recentFlyer(db),
  ])

  const used = new Set<string>()

  // 1. Featured — a weighted candidate pool: on-this-day first, then favourites,
  //    then any high-precision memory, then anything. The server picks a stable
  //    first frame (dailyIndex) for SSR; the client rotates through the rest,
  //    dissolving on load and while idle, never repeating the previous pick.
  const pool = uniqueById([
    ...onThisDayPool,
    ...recentPool.filter((media) => media.favorite && highPrecision(media)),
    ...recentPool.filter(highPrecision),
    ...recentPool,
  ]).filter((media) => thumbOf(media)) // a hero must have something to show
  const featured = pool.length ? (pool[dailyIndex(Math.min(pool.length, 12))] ?? pool[0]) : null
  const featuredPool = pool.slice(0, FEATURED_POOL_SIZE)
  if (featured) used.add(featured.id)

  // Collections covers, from the same recent pull — mosaic of photos, newest
  // video's poster, newest flyer. Never grey: an empty list falls to type.
  const newestVideo = recentPool.find((media) => media.type === 'video' && thumbOf(media))
  const collections = {
    photos: recentPool
      .filter((media) => media.type === 'photo' && thumbOf(media))
      .slice(0, 4)
      .map((media) => thumbOf(media) as string),
    video: newestVideo ? thumbOf(newestVideo) : null,
    artifact,
  }

  // 2. On this day — a real month+day match, de-duped against Featured.
  const onThisDay = onThisDayPool.filter((media) => !used.has(media.id)).slice(0, 12)
  const onThisDayFinal = onThisDay.length >= 2 ? onThisDay : []
  onThisDayFinal.forEach((media) => used.add(media.id))

  // 5. Recently added — individual media by created_at, never albums, de-duped.
  const recentlyAdded = recentPool.filter((media) => !used.has(media.id)).slice(0, 12)
  const recentlyAddedFinal = recentlyAdded.length >= 2 ? recentlyAdded : []
  recentlyAddedFinal.forEach((media) => used.add(media.id))

  // 4. Jump back in — the two or three densest years.
  const jumpBack = [...years]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  const jumpBackFinal = jumpBack.length >= 2 ? jumpBack : []

  return {
    featured,
    featuredPool,
    onThisDay: onThisDayFinal,
    comingUp: planned,
    jumpBack: jumpBackFinal,
    recentlyAdded: recentlyAddedFinal,
    hasMedia: recentPool.length > 0,
    collections,
  }
}
