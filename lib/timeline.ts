import 'server-only'

import type { DB } from '@/lib/api'
import { hydrate } from '@/lib/queries'
import type { MediaRow, MediaView } from '@/lib/types'

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
