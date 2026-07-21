import 'server-only'

import type { DB } from '@/lib/api'
import { flyerUrl, avatarUrl } from '@/lib/community/avatars'
import { presignGet } from '@/lib/r2'
import { playbackUrls } from '@/lib/stream'
import { isConfigured } from '@/lib/env'
import type { BoardEvent, EventRow } from '@/lib/types'

/**
 * The community board.
 *
 * Every board event is a collection with kind='event'. Its picture is the flyer
 * if one was posted, otherwise the most recent frame in its album — so an event
 * always has a face even before anyone adds a flyer.
 */
export async function getBoardEvents(db: DB): Promise<BoardEvent[]> {
  const { data } = await db
    .from('events')
    .select('*')
    .eq('kind', 'event')
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const events = (data ?? []) as EventRow[]
  if (events.length === 0) return []

  const ids = events.map((e) => e.id)

  // Media counts + a cover candidate per event, and comment counts, in a couple
  // of round trips rather than per-card queries.
  const [{ data: mediaRows }, { data: commentRows }, hosts] = await Promise.all([
    db
      .from('media')
      .select('event_id, stream_uid, poster_url, r2_thumb_key, r2_display_key, created_at')
      .in('event_id', ids)
      .eq('status', 'ready')
      .order('created_at', { ascending: false }),
    db.from('comments').select('collection_id').in('collection_id', ids),
    loadHosts(db, events),
  ])

  const mediaByEvent = new Map<string, Record<string, unknown>[]>()
  for (const row of (mediaRows ?? []) as Record<string, unknown>[]) {
    const key = row.event_id as string
    if (!mediaByEvent.has(key)) mediaByEvent.set(key, [])
    mediaByEvent.get(key)!.push(row)
  }

  const commentCounts = new Map<string, number>()
  for (const row of (commentRows ?? []) as { collection_id: string }[]) {
    commentCounts.set(row.collection_id, (commentCounts.get(row.collection_id) ?? 0) + 1)
  }

  const r2Ready = isConfigured('r2')
  const streamReady = isConfigured('stream')

  return Promise.all(
    events.map(async (event): Promise<BoardEvent> => {
      const media = mediaByEvent.get(event.id) ?? []
      let cover: string | null = null
      const first = media[0]
      if (first) {
        if (first.stream_uid && streamReady) {
          cover = (first.poster_url as string | null) ?? playbackUrls(first.stream_uid as string).poster
        } else if (r2Ready) {
          const key = (first.r2_thumb_key as string | null) ?? (first.r2_display_key as string | null)
          cover = key ? await presignGet(key) : null
        }
      }
      const host = hosts.get(event.created_by_member ?? '')
      return {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        description: event.description,
        flyer_url: flyerUrl(event.flyer_path),
        cover_url: cover,
        host_name: host?.display_name ?? null,
        host_avatar_url: host?.avatar_url ?? null,
        media_count: media.length,
        comment_count: commentCounts.get(event.id) ?? 0,
        created_at: event.created_at,
      }
    }),
  )
}

export async function getCollectionById(db: DB, id: string): Promise<BoardEvent | null> {
  const { data } = await db.from('events').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const event = data as EventRow

  const [{ count: mediaCount }, { count: commentCount }, hosts] = await Promise.all([
    db.from('media').select('id', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'ready'),
    db.from('comments').select('id', { count: 'exact', head: true }).eq('collection_id', id),
    loadHosts(db, [event]),
  ])

  const host = hosts.get(event.created_by_member ?? '')
  return {
    id: event.id,
    name: event.name,
    event_date: event.event_date,
    description: event.description,
    flyer_url: flyerUrl(event.flyer_path),
    cover_url: null,
    host_name: host?.display_name ?? null,
    host_avatar_url: host?.avatar_url ?? null,
    media_count: mediaCount ?? 0,
    comment_count: commentCount ?? 0,
    created_at: event.created_at,
  }
}

async function loadHosts(
  db: DB,
  events: EventRow[],
): Promise<Map<string, { display_name: string; avatar_url: string | null }>> {
  const memberIds = [...new Set(events.map((e) => e.created_by_member).filter(Boolean))] as string[]
  if (memberIds.length === 0) return new Map()
  const { data } = await db
    .from('members')
    .select('id, display_name, avatar_path')
    .in('id', memberIds)
  return new Map(
    ((data ?? []) as { id: string; display_name: string; avatar_path: string | null }[]).map((m) => [
      m.id,
      { display_name: m.display_name, avatar_url: avatarUrl(m.avatar_path) },
    ]),
  )
}
