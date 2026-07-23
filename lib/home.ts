import 'server-only'

import type { DB } from '@/lib/api'
import { getBoardEvents } from '@/lib/community/events'
import { getFeed, getOnThisDay, getYears } from '@/lib/queries'
import { dailyIndex, formatCapturedAt, fullDate, season } from '@/lib/format'
import { presignGet } from '@/lib/r2'
import { isConfigured } from '@/lib/env'
import type { BoardEvent, MediaView } from '@/lib/types'

/**
 * The front door's data.
 *
 * Three rules run through it:
 *   1. The Featured hero models the *subject* separately from the *cover* — so a
 *      hero labeled "Father's Day 2023" opens the event, not one stray photo.
 *   2. Recently added groups by event — 45 photos dropped into one event is one
 *      card ("… · 45 added"), not a flood.
 *   3. Graceful thinness — a rail with fewer than two fresh items hides itself.
 */

/** A hero candidate: what it's *about* (subject) is decoupled from the image
 *  that represents it (cover), so the label and the click always agree. */
export interface FeaturedItem {
  subjectType: 'event' | 'media'
  subjectId: string
  title: string
  dateLabel: string
  /** Where the button goes — the event, or the photo. */
  href: string
  image: string | null
  width: number | null
  height: number | null
  focalX: number
  focalY: number
}

/** One row of "Recently added": a lone photo, or an event that just gained a
 *  batch (shown once, with a count, never as a flood of tiles). */
export type RecentEntry =
  | { kind: 'media'; media: MediaView }
  | {
      kind: 'event'
      id: string
      name: string
      addedCount: number
      cover: string | null
      focalX: number
      focalY: number
    }

export interface HomeData {
  /** The server's first-paint pick (stable within a day) — the SSR frame. */
  featured: FeaturedItem | null
  /** The weighted candidate set the client rotates through, never repeating. */
  featuredPool: FeaturedItem[]
  onThisDay: MediaView[]
  comingUp: BoardEvent[]
  jumpBack: { year: number; count: number }[]
  recentlyAdded: RecentEntry[]
  hasMedia: boolean
  /** Real covers for the Collections tiles, so none of them renders grey. */
  collections: {
    photos: string[]
    video: string | null
    artifact: string | null
  }
}

const FEATURED_POOL_SIZE = 16
const HERO_ASPECT = 16 / 9

const highPrecision = (media: MediaView) =>
  media.taken_precision === 'exact' || media.taken_precision === 'day'

function thumbOf(media: MediaView): string | null {
  return media.thumb_url ?? media.display_url
}
function heroImage(media: MediaView): string | null {
  return media.display_url ?? media.thumb_url
}

/** Closeness of an item's aspect to the 16:9 hero — 1 at 16:9, falling off
 *  either side. Unknown dimensions read as mildly landscape. */
function landscapeScore(media: MediaView): number {
  const aspect = media.width && media.height ? media.width / media.height : 1.4
  return 1 / (1 + Math.abs(aspect - HERO_ASPECT))
}

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

export async function getHomeData(db: DB): Promise<HomeData> {
  const [onThisDayPool, recentPool, planned, years, artifact] = await Promise.all([
    getOnThisDay(db), // already excludes approximate dates
    getFeed(db, { limit: 96, order: 'newest' }),
    getBoardEvents(db), // planned events (the Board holds the future)
    getYears(db),
    recentFlyer(db),
  ])

  // The events any pool media belongs to, so the hero can feature the event
  // (title + link) rather than the stray frame that represents it.
  const eventIds = [
    ...new Set([...recentPool, ...onThisDayPool].map((m) => m.event_id).filter(Boolean)),
  ] as string[]
  const { data: eventRows } = eventIds.length
    ? await db
        .from('events')
        .select('id, name, event_date, status, merged_into')
        .in('id', eventIds)
    : { data: [] }
  const eventById = new Map(
    ((eventRows ?? []) as {
      id: string
      name: string
      event_date: string | null
      status: string
      merged_into: string | null
    }[])
      .filter((e) => !e.merged_into)
      .map((e) => [e.id, e]),
  )

  // 1. Featured — a weighted candidate pool (on-this-day, favourites, then any
  //    high-precision memory, then anything), biased toward 16:9 so the hero
  //    mostly frames landscape and portraits are the exception the client
  //    handles with a blurred backdrop. Each becomes a subject/cover pair.
  const curated = uniqueById([
    ...onThisDayPool,
    ...recentPool.filter((media) => media.favorite && highPrecision(media)),
    ...recentPool.filter(highPrecision),
    ...recentPool,
  ]).filter((media) => heroImage(media))

  const ordered = curated
    .map((media, index) => ({ media, score: curated.length - index + landscapeScore(media) * 6 }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.media)

  const toFeatured = (media: MediaView): FeaturedItem => {
    const event = media.event_id ? eventById.get(media.event_id) : undefined
    if (event) {
      return {
        subjectType: 'event',
        subjectId: event.id,
        title: event.name,
        dateLabel: fullDate(event.event_date ?? media.taken_at),
        href: `/community/${event.id}`,
        image: heroImage(media),
        width: media.width,
        height: media.height,
        focalX: media.focal_x,
        focalY: media.focal_y,
      }
    }
    return {
      subjectType: 'media',
      subjectId: media.id,
      title: media.caption || media.event_name || season(media.taken_at),
      dateLabel: formatCapturedAt(media.taken_at, media.taken_precision),
      href: `/m/${media.id}`,
      image: heroImage(media),
      width: media.width,
      height: media.height,
      focalX: media.focal_x,
      focalY: media.focal_y,
    }
  }

  const featuredPool = ordered.slice(0, FEATURED_POOL_SIZE).map(toFeatured)
  const featured = featuredPool.length
    ? (featuredPool[dailyIndex(Math.min(featuredPool.length, 12))] ?? featuredPool[0])
    : null

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

  // 2. On this day — a real month+day match. De-duped only against itself; the
  //    hero rotates, so pinning it against a moving target isn't meaningful.
  const onThisDay = uniqueById(onThisDayPool).slice(0, 12)
  const onThisDayFinal = onThisDay.length >= 2 ? onThisDay : []
  const seen = new Set(onThisDayFinal.map((media) => media.id))

  // 3. Recently added — grouped by event so a big drop is one card, ordered by
  //    the most recent upload in each group (activity, not event date).
  const grouped = new Map<string, MediaView[]>()
  const loose: MediaView[] = []
  for (const media of recentPool) {
    if (media.event_id) {
      const list = grouped.get(media.event_id) ?? []
      list.push(media)
      grouped.set(media.event_id, list)
    } else if (!seen.has(media.id)) {
      loose.push(media)
    }
  }
  const entries: { entry: RecentEntry; at: number }[] = []
  for (const [id, items] of grouped) {
    const newest = items[0] // recentPool is newest-first
    entries.push({
      entry: {
        kind: 'event',
        id,
        name: newest.event_name ?? 'Event',
        addedCount: items.length,
        cover: thumbOf(newest),
        focalX: newest.focal_x,
        focalY: newest.focal_y,
      },
      at: new Date(newest.created_at).getTime(),
    })
  }
  for (const media of loose) {
    entries.push({ entry: { kind: 'media', media }, at: new Date(media.created_at).getTime() })
  }
  entries.sort((a, b) => b.at - a.at)
  const recentlyAdded = entries.length >= 2 ? entries.slice(0, 12).map((e) => e.entry) : []

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
    recentlyAdded,
    hasMedia: recentPool.length > 0,
    collections,
  }
}
