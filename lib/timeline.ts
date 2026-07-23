import 'server-only'

import type { DB } from '@/lib/api'
import { hydrate } from '@/lib/queries'
import { presignGet } from '@/lib/r2'
import { playbackUrls } from '@/lib/stream'
import { isConfigured } from '@/lib/env'
import type { ArtifactType, MediaRow, MediaView } from '@/lib/types'

/**
 * The timeline's reads.
 *
 * Two shapes: a cheap grouped count of what exists (for the decades rail and to
 * skip empty months) and a keyset-paginated page of media ordered by
 * (taken_at, id) — no OFFSET, so it stays fast into the tens of thousands.
 */

export interface TimelineCursor {
  takenAt: string
  id: string
}

export interface MonthCount {
  year: number
  month: number
  count: number
}

/** Grouped server-side (timeline_month_counts RPC) — the client never counts rows. */
export async function getTimelineMonthCounts(db: DB): Promise<MonthCount[]> {
  const { data, error } = await db.rpc('timeline_month_counts')
  if (error) return []
  return ((data ?? []) as { year: number; month: number; n: number }[]).map((row) => ({
    year: row.year,
    month: row.month,
    count: row.n,
  }))
}

export interface TimelineEvent {
  id: string
  name: string
  /** When it happened — the date it sits at in the timeline. */
  date: string
  cover_url: string | null
  /** How many ready memories live inside — the collapsed card's count. */
  count: number
  /** Up to five thumbnails for the collapsed card's preview strip. */
  preview: string[]
}

/** A media row's thumbnail, from Stream poster or the R2 thumb/display key. */
function thumbForMedia(
  row: {
    stream_uid?: string | null
    poster_url?: string | null
    r2_thumb_key?: string | null
    r2_display_key?: string | null
  },
  ready: { r2: boolean; stream: boolean },
): Promise<string | null> {
  if (row.stream_uid && ready.stream) {
    return Promise.resolve(row.poster_url ?? playbackUrls(row.stream_uid).poster)
  }
  if (ready.r2) {
    const key = row.r2_thumb_key ?? row.r2_display_key
    return key ? presignGet(key) : Promise.resolve(null)
  }
  return Promise.resolve(null)
}

/**
 * Completed board events, so a just-completed event appears in the timeline at
 * its date even before anyone has added a photo to it, and so its media renders
 * *only* inside its card (never loose in the grid too). Bounded (there are never
 * many events), so counts, covers, and a preview strip are resolved directly.
 * Planned events are excluded — the future belongs to the Board, not the Timeline.
 */
export async function getTimelineEvents(db: DB): Promise<TimelineEvent[]> {
  const { data } = await db
    .from('events')
    .select('id, name, event_date, created_at, cover_media_id')
    .eq('kind', 'event')
    .eq('status', 'completed')
    .is('merged_into', null)

  const events = (data ?? []) as {
    id: string
    name: string
    event_date: string | null
    created_at: string
    cover_media_id: string | null
  }[]
  if (events.length === 0) return []

  const ready = { r2: isConfigured('r2'), stream: isConfigured('stream') }
  const ids = events.map((e) => e.id)

  // One trip for every event's media (ordered newest-first), grouped in JS: the
  // count is exact and the first few become the preview strip.
  const { data: mediaRows } = await db
    .from('media')
    .select('id, event_id, stream_uid, poster_url, r2_thumb_key, r2_display_key, taken_at')
    .in('event_id', ids)
    .eq('status', 'ready')
    .order('taken_at', { ascending: false })

  type MediaBit = {
    id: string
    event_id: string
    stream_uid: string | null
    poster_url: string | null
    r2_thumb_key: string | null
    r2_display_key: string | null
  }
  const byEvent = new Map<string, MediaBit[]>()
  for (const row of (mediaRows ?? []) as MediaBit[]) {
    const list = byEvent.get(row.event_id) ?? []
    list.push(row)
    byEvent.set(row.event_id, list)
  }

  // A deliberately chosen cover wins over the newest frame.
  const coverIds = [...new Set(events.map((e) => e.cover_media_id).filter(Boolean))] as string[]
  const coverThumb = new Map<string, string | null>()
  if (coverIds.length) {
    const { data: coverRows } = await db
      .from('media')
      .select('id, stream_uid, poster_url, r2_thumb_key, r2_display_key')
      .in('id', coverIds)
      .eq('status', 'ready')
    for (const row of (coverRows ?? []) as MediaBit[]) {
      coverThumb.set(row.id, await thumbForMedia(row, ready))
    }
  }

  return Promise.all(
    events.map(async (event): Promise<TimelineEvent> => {
      const rows = byEvent.get(event.id) ?? []
      const preview = (
        await Promise.all(rows.slice(0, 5).map((row) => thumbForMedia(row, ready)))
      ).filter((url): url is string => Boolean(url))
      const explicit = event.cover_media_id ? (coverThumb.get(event.cover_media_id) ?? null) : null
      return {
        id: event.id,
        name: event.name,
        date: event.event_date ?? event.created_at,
        cover_url: explicit ?? preview[0] ?? null,
        count: rows.length,
        preview,
      }
    }),
  )
}

export interface TimelineArtifact {
  id: string
  event_id: string
  type: ArtifactType
  title: string | null
  date: string
  thumb: string | null
}

/** Artifacts carrying a captured_at earn a small card in the timeline at that
 *  date (a flyer made two weeks before the party is when the plan started).
 *  Ones without a date stay attached to their event only. Bounded set. */
export async function getTimelineArtifacts(db: DB): Promise<TimelineArtifact[]> {
  const { data } = await db
    .from('event_artifacts')
    .select('id, event_id, type, title, storage_key, captured_at')
    .not('captured_at', 'is', null)

  const rows = (data ?? []) as {
    id: string
    event_id: string
    type: ArtifactType
    title: string | null
    storage_key: string | null
    captured_at: string
  }[]
  const r2 = isConfigured('r2')

  return Promise.all(
    rows.map(async (row): Promise<TimelineArtifact> => {
      const isImage = row.type === 'flyer' || row.type === 'image_doc'
      const thumb = isImage && row.storage_key && r2 ? await presignGet(row.storage_key) : null
      return { id: row.id, event_id: row.event_id, type: row.type, title: row.title, date: row.captured_at, thumb }
    }),
  )
}

export interface TimelinePage {
  media: MediaView[]
  nextCursor: TimelineCursor | null
}

export interface TimelineQuery {
  limit?: number
  cursor?: TimelineCursor | null
  type?: 'photo' | 'video' | null
  personId?: string | null
}

/** Sorts last within a taken_at, so a cursor at end-of-year lands cleanly. */
const MAX_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

/** A cursor that starts the walk at the end of the given year (for jump-to-year). */
export function cursorForYearEnd(year: number): TimelineCursor {
  return { takenAt: new Date(Date.UTC(year + 1, 0, 1)).toISOString(), id: MAX_ID }
}

export async function getTimelinePage(db: DB, query: TimelineQuery = {}): Promise<TimelinePage> {
  const limit = Math.min(query.limit ?? 48, 200)

  // Person filter uses an inner join rather than a giant id list, mirroring
  // getFeed. Everything else is a plain keyset walk.
  const columns = query.personId ? '*, media_people!inner(person_id)' : '*'
  let builder = db
    .from('media')
    .select(columns)
    .eq('status', 'ready')
    .order('taken_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1) // one extra row tells us whether another page exists

  if (query.personId) builder = builder.eq('media_people.person_id', query.personId)
  if (query.type) builder = builder.eq('type', query.type)

  if (query.cursor) {
    // Keyset: strictly older than the cursor by (taken_at, id). Normalised to a
    // comma-free ISO string so it can't break the PostgREST or() grammar.
    const takenAt = new Date(query.cursor.takenAt).toISOString()
    const id = query.cursor.id
    builder = builder.or(`taken_at.lt.${takenAt},and(taken_at.eq.${takenAt},id.lt.${id})`)
  }

  const { data, error } = await builder
  if (error) throw new Error(`Could not load the timeline: ${error.message}`)

  // The person join can repeat a parent row; collapse in query order.
  const rowsById = new Map<string, MediaRow>()
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const { media_people, ...media } = row
    void media_people
    const item = media as unknown as MediaRow
    if (!rowsById.has(item.id)) rowsById.set(item.id, item)
  }
  let rows = [...rowsById.values()]

  const hasMore = rows.length > limit
  if (hasMore) rows = rows.slice(0, limit)

  const media = await hydrate(db, rows)
  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last ? { takenAt: last.taken_at, id: last.id } : null
  return { media, nextCursor }
}
