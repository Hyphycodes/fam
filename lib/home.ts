import 'server-only'

import type { DB } from '@/lib/api'
import { getBoardEvents } from '@/lib/community/events'
import { getFeed, getOnThisDay, getYears } from '@/lib/queries'
import { dailyIndex } from '@/lib/format'
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
  featured: MediaView | null
  onThisDay: MediaView[]
  comingUp: BoardEvent[]
  jumpBack: { year: number; count: number }[]
  recentlyAdded: MediaView[]
  hasMedia: boolean
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
  const [onThisDayPool, recentPool, planned, years] = await Promise.all([
    getOnThisDay(db), // already excludes approximate dates
    getFeed(db, { limit: 96, order: 'newest' }),
    getBoardEvents(db), // planned events (the Board holds the future)
    getYears(db),
  ])

  const used = new Set<string>()

  // 1. Featured — rotate daily through a weighted candidate pool: on-this-day
  //    first, then favourites, then any high-precision memory, then anything.
  //    dailyIndex gives a stable pick that changes each day (a "not shown
  //    recently" signal without per-user tracking).
  const pool = uniqueById([
    ...onThisDayPool,
    ...recentPool.filter((media) => media.favorite && highPrecision(media)),
    ...recentPool.filter(highPrecision),
    ...recentPool,
  ])
  const featured = pool.length ? (pool[dailyIndex(Math.min(pool.length, 12))] ?? pool[0]) : null
  if (featured) used.add(featured.id)

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
    onThisDay: onThisDayFinal,
    comingUp: planned,
    jumpBack: jumpBackFinal,
    recentlyAdded: recentlyAddedFinal,
    hasMedia: recentPool.length > 0,
  }
}
