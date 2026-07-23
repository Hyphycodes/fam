import 'server-only'

import type { DB } from '@/lib/api'
import { flyerUrl, avatarUrl } from '@/lib/community/avatars'
import { presignGet } from '@/lib/r2'
import { playbackUrls } from '@/lib/stream'
import { isConfigured } from '@/lib/env'
import type { BoardEvent, EventRow } from '@/lib/types'

/**
 * The community board — now the *planning* surface.
 *
 * It holds what hasn't happened yet: events that are still planned (and, later,
 * upcoming/live). Completed events leave the board and live in the Timeline.
 * A planned event's face is its flyer — the artwork you made for it — falling
 * back to the newest frame in its album if one somehow exists.
 *
 * Ordered soonest-intended first (a plan with a date beats an open-ended one),
 * then newest.
 */
export async function getBoardEvents(db: DB): Promise<BoardEvent[]> {
  const { data } = await db
    .from('events')
    .select('*')
    .eq('kind', 'event')
    .neq('status', 'completed')
    .is('merged_into', null)
    .order('starts_at', { ascending: true, nullsFirst: false })
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
      const host = hostFor(event, hosts)
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
        status: event.status,
        starts_at: event.starts_at,
        location: event.location,
        merged_into: event.merged_into,
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

  const host = hostFor(event, hosts)
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
    status: event.status,
    starts_at: event.starts_at,
    location: event.location,
    merged_into: event.merged_into,
  }
}

type Host = { display_name: string; avatar_url: string | null }
type HostMaps = { byMember: Map<string, Host>; byLegacy: Map<string, Host> }

/** Events can be hosted by a passcode member or a legacy email account —
 *  whichever created them. Try the member id first, then the legacy id. */
function hostFor(event: EventRow, hosts: HostMaps): Host | undefined {
  return (
    (event.created_by_member ? hosts.byMember.get(event.created_by_member) : undefined) ??
    (event.created_by ? hosts.byLegacy.get(event.created_by) : undefined)
  )
}

async function loadHosts(db: DB, events: EventRow[]): Promise<HostMaps> {
  const memberIds = [...new Set(events.map((e) => e.created_by_member).filter(Boolean))] as string[]
  const legacyIds = [...new Set(events.map((e) => e.created_by).filter(Boolean))] as string[]

  const [{ data: members }, { data: profiles }] = await Promise.all([
    memberIds.length
      ? db.from('members').select('id, display_name, avatar_path').in('id', memberIds)
      : Promise.resolve({ data: [] }),
    legacyIds.length
      ? db.from('profiles').select('id, display_name, avatar_url').in('id', legacyIds)
      : Promise.resolve({ data: [] }),
  ])

  return {
    byMember: new Map(
      ((members ?? []) as { id: string; display_name: string; avatar_path: string | null }[]).map(
        (m) => [m.id, { display_name: m.display_name, avatar_url: avatarUrl(m.avatar_path) }],
      ),
    ),
    byLegacy: new Map(
      ((profiles ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map(
        (p) => [p.id, { display_name: p.display_name, avatar_url: avatarUrl(p.avatar_url) }],
      ),
    ),
  }
}
