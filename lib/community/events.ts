import 'server-only'

import type { DB } from '@/lib/api'
import { flyerUrl, avatarUrl } from '@/lib/community/avatars'
import { presignGet } from '@/lib/r2'
import { playbackUrls } from '@/lib/stream'
import { isConfigured } from '@/lib/env'
import type { BoardEvent, EventRow } from '@/lib/types'

/**
 * The community board — the *event* surface.
 *
 * Board is event-first (Timeline is media-first). Planned events are what
 * hasn't happened yet; past events are everything completed. Each event's face
 * is its flyer — the artwork you made for it — falling back to the newest frame
 * in its album.
 *
 * Planned: soonest-intended first (a plan with a date beats an open-ended one,
 * but an open-ended "someday" still sorts above dated ones — an undated plan is
 * a good, live state), then newest.
 */
export async function getBoardEvents(db: DB): Promise<BoardEvent[]> {
  const { data } = await db
    .from('events')
    .select('*')
    .eq('kind', 'event')
    .neq('status', 'completed')
    .is('merged_into', null)
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })

  return resolveEvents(db, (data ?? []) as EventRow[])
}

/**
 * Everything that has happened — completed events, most recent first. The Board
 * shows these below the plans, in a denser grid; the Timeline threads their
 * media into the scroll, but the Board keeps them as whole events.
 */
export async function getPastEvents(db: DB): Promise<BoardEvent[]> {
  const { data } = await db
    .from('events')
    .select('*')
    .eq('kind', 'event')
    .eq('status', 'completed')
    .is('merged_into', null)
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  return resolveEvents(db, (data ?? []) as EventRow[])
}

/** Resolve a set of event rows into board cards: a cover candidate and counts,
 *  in a couple of round trips rather than per-card queries. */
async function resolveEvents(db: DB, events: EventRow[]): Promise<BoardEvent[]> {
  if (events.length === 0) return []

  const ids = events.map((e) => e.id)

  const [{ data: mediaRows }, { data: commentRows }, people] = await Promise.all([
    db
      .from('media')
      .select('event_id, stream_uid, poster_url, r2_thumb_key, r2_display_key, focal_x, focal_y, created_at')
      .in('event_id', ids)
      .eq('status', 'ready')
      .order('created_at', { ascending: false }),
    db.from('comments').select('collection_id').in('collection_id', ids),
    loadPeople(db, events),
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
      let focalX = 0.5
      let focalY = 0.5
      const first = media[0]
      if (first) {
        if (first.stream_uid && streamReady) {
          cover = (first.poster_url as string | null) ?? playbackUrls(first.stream_uid as string).poster
        } else if (r2Ready) {
          const key = (first.r2_thumb_key as string | null) ?? (first.r2_display_key as string | null)
          cover = key ? await presignGet(key) : null
        }
        if (cover) {
          focalX = typeof first.focal_x === 'number' ? (first.focal_x as number) : 0.5
          focalY = typeof first.focal_y === 'number' ? (first.focal_y as number) : 0.5
        }
      }
      const host = hostFor(event, people)
      const editor = editorFor(event, people)
      return {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        description: event.description,
        flyer_url: flyerUrl(event.flyer_path),
        cover_url: cover,
        cover_media_id: event.cover_media_id,
        cover_focal_x: focalX,
        cover_focal_y: focalY,
        host_name: host?.display_name ?? null,
        host_avatar_url: host?.avatar_url ?? null,
        media_count: media.length,
        comment_count: commentCounts.get(event.id) ?? 0,
        created_at: event.created_at,
        status: event.status,
        starts_at: event.starts_at,
        location: event.location,
        merged_into: event.merged_into,
        editor_name: editor?.display_name ?? null,
        last_edited_at: event.last_edited_at,
      }
    }),
  )
}

export async function getCollectionById(db: DB, id: string): Promise<BoardEvent | null> {
  const { data } = await db.from('events').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const event = data as EventRow

  const [{ count: mediaCount }, { count: commentCount }, people] = await Promise.all([
    db.from('media').select('id', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'ready'),
    db.from('comments').select('id', { count: 'exact', head: true }).eq('collection_id', id),
    loadPeople(db, [event]),
  ])

  const host = hostFor(event, people)
  const editor = editorFor(event, people)
  return {
    id: event.id,
    name: event.name,
    event_date: event.event_date,
    description: event.description,
    flyer_url: flyerUrl(event.flyer_path),
    cover_url: null,
    cover_media_id: event.cover_media_id,
    cover_focal_x: 0.5,
    cover_focal_y: 0.5,
    host_name: host?.display_name ?? null,
    host_avatar_url: host?.avatar_url ?? null,
    media_count: mediaCount ?? 0,
    comment_count: commentCount ?? 0,
    created_at: event.created_at,
    status: event.status,
    starts_at: event.starts_at,
    location: event.location,
    merged_into: event.merged_into,
    editor_name: editor?.display_name ?? null,
    last_edited_at: event.last_edited_at,
  }
}

type Person = { display_name: string; avatar_url: string | null }
type PersonMaps = { byMember: Map<string, Person>; byLegacy: Map<string, Person> }

/** Events can be hosted by a passcode member or a legacy email account —
 *  whichever created them. Try the member id first, then the legacy id. */
function hostFor(event: EventRow, people: PersonMaps): Person | undefined {
  return (
    (event.created_by_member ? people.byMember.get(event.created_by_member) : undefined) ??
    (event.created_by ? people.byLegacy.get(event.created_by) : undefined)
  )
}

/** Whoever last edited a field, resolved the same way as the host. */
function editorFor(event: EventRow, people: PersonMaps): Person | undefined {
  return (
    (event.last_edited_by_member ? people.byMember.get(event.last_edited_by_member) : undefined) ??
    (event.last_edited_by ? people.byLegacy.get(event.last_edited_by) : undefined)
  )
}

/** One pass that resolves every name an event needs — its host and its last
 *  editor — across both identity systems. */
async function loadPeople(db: DB, events: EventRow[]): Promise<PersonMaps> {
  const memberIds = [
    ...new Set(events.flatMap((e) => [e.created_by_member, e.last_edited_by_member]).filter(Boolean)),
  ] as string[]
  const legacyIds = [
    ...new Set(events.flatMap((e) => [e.created_by, e.last_edited_by]).filter(Boolean)),
  ] as string[]

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
