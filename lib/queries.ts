import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isConfigured } from '@/lib/env'
import { presignGet } from '@/lib/r2'
import { playbackUrls } from '@/lib/stream'
import type { EventRow, MediaRow, MediaView, Person, Profile } from '@/lib/types'

/**
 * Reading media.
 *
 * Relations are stitched in JS from a handful of `.in()` queries rather than
 * PostgREST embeds. It's a few more lines, but the query shape is obvious and
 * it stays at ~5 round trips no matter how big the page is.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>

export interface FeedOptions {
  limit?: number
  /** Cursor: only rows created strictly before this ISO timestamp. */
  before?: string | null
  eventId?: string | null
  personId?: string | null
  year?: number | null
  favorite?: boolean
  uploaderId?: string | null
  /** Movie Mode wants the whole archive, shuffled client-side. */
  order?: 'newest' | 'oldest' | 'taken'
}

export async function getFeed(db: DB, options: FeedOptions = {}): Promise<MediaView[]> {
  const limit = Math.min(options.limit ?? 24, 500)

  // Filtering by person uses an inner join rather than collecting ids and
  // passing them back as `.in(...)`: someone tagged in a thousand memories
  // would produce a query string long enough to be rejected outright.
  const columns = options.personId ? '*, media_people!inner(person_id)' : '*'

  let query = db.from('media').select(columns).eq('status', 'ready').limit(limit)
  if (options.personId) query = query.eq('media_people.person_id', options.personId)

  if (options.order === 'taken') query = query.order('taken_at', { ascending: false })
  else if (options.order === 'oldest') query = query.order('created_at', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  if (options.before) query = query.lt('created_at', options.before)
  if (options.eventId) query = query.eq('event_id', options.eventId)
  if (options.year) query = query.eq('taken_year', options.year)
  if (options.favorite) query = query.eq('favorite', true)
  if (options.uploaderId) query = query.eq('uploader_id', options.uploaderId)

  const { data, error } = await query
  if (error) throw new Error(`Could not load the feed: ${error.message}`)

  // Drop the join rows — they exist only to filter, and would otherwise ride
  // along on every MediaView.
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const { media_people, ...media } = row
    void media_people
    return media as unknown as MediaRow
  })

  return hydrate(db, rows)
}

export async function getMediaById(db: DB, id: string): Promise<MediaView | null> {
  const { data, error } = await db.from('media').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Could not load that memory: ${error.message}`)
  if (!data) return null
  const [view] = await hydrate(db, [data as MediaRow])
  return view ?? null
}

/** Memories from this day in earlier years. */
export async function getOnThisDay(db: DB): Promise<MediaView[]> {
  const now = new Date()
  const { data, error } = await db
    .from('media')
    .select('*')
    .eq('status', 'ready')
    .eq('taken_month', now.getMonth() + 1)
    .eq('taken_day', now.getDate())
    .neq('taken_year', now.getFullYear())
    .order('taken_at', { ascending: false })
    .limit(24)

  if (error) return []
  return hydrate(db, (data ?? []) as MediaRow[])
}

export async function getNewThisWeek(db: DB): Promise<MediaView[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('media')
    .select('*')
    .eq('status', 'ready')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(24)

  if (error) return []
  return hydrate(db, (data ?? []) as MediaRow[])
}

/** Anything the uploader is still waiting on — shown so it never looks lost. */
export async function getPending(db: DB, uploaderId: string): Promise<MediaRow[]> {
  const { data } = await db
    .from('media')
    .select('*')
    .eq('uploader_id', uploaderId)
    .neq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as MediaRow[]
}

export async function getEvents(db: DB): Promise<(EventRow & { media_count: number })[]> {
  const { data: events } = await db
    .from('events')
    .select('*')
    .order('event_date', { ascending: false, nullsFirst: false })

  const rows = (events ?? []) as EventRow[]
  if (rows.length === 0) return []

  const { data: counts } = await db
    .from('media')
    .select('event_id')
    .eq('status', 'ready')
    .in('event_id', rows.map((e) => e.id))

  const tally = new Map<string, number>()
  for (const row of (counts ?? []) as { event_id: string | null }[]) {
    if (row.event_id) tally.set(row.event_id, (tally.get(row.event_id) ?? 0) + 1)
  }

  return rows.map((event) => ({ ...event, media_count: tally.get(event.id) ?? 0 }))
}

export async function getPeople(db: DB): Promise<(Person & { media_count: number })[]> {
  const { data: people } = await db.from('people').select('*').order('name')
  const rows = (people ?? []) as Person[]
  if (rows.length === 0) return []

  const { data: links } = await db.from('media_people').select('person_id')
  const tally = new Map<string, number>()
  for (const link of (links ?? []) as { person_id: string }[]) {
    tally.set(link.person_id, (tally.get(link.person_id) ?? 0) + 1)
  }

  return rows.map((person) => ({ ...person, media_count: tally.get(person.id) ?? 0 }))
}

export async function getYears(db: DB): Promise<{ year: number; count: number }[]> {
  const { data } = await db.from('media').select('taken_year').eq('status', 'ready')
  const tally = new Map<number, number>()
  for (const row of (data ?? []) as { taken_year: number }[]) {
    tally.set(row.taken_year, (tally.get(row.taken_year) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year)
}

// ---------------------------------------------------------------------------
// Owner tools
//
// Loaded server-side and handed to the client as props, so the settings page
// arrives populated instead of flashing empty lists on mount.
// ---------------------------------------------------------------------------

export interface Invite {
  email: string
  role: string
  display_name: string | null
  invited_at: string
  claimed_at: string | null
}

export async function getInvites(admin: DB): Promise<Invite[]> {
  const { data } = await admin
    .from('allowed_emails')
    .select('email, role, display_name, invited_at, claimed_at')
    .order('invited_at', { ascending: false })
  return (data ?? []) as Invite[]
}

export interface UploadLink {
  id: string
  token: string
  url: string
  label: string | null
  revoked_at: string | null
  expires_at: string | null
  event_name: string | null
}

export async function getUploadLinks(admin: DB, baseUrl: string): Promise<UploadLink[]> {
  const { data } = await admin
    .from('event_upload_links')
    .select('id, token, label, revoked_at, expires_at, event_id')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as (Omit<UploadLink, 'url' | 'event_name'> & {
    event_id: string
  })[]
  if (rows.length === 0) return []

  const { data: events } = await admin
    .from('events')
    .select('id, name')
    .in('id', rows.map((r) => r.event_id))

  const nameById = new Map(
    ((events ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]),
  )

  return rows.map((row) => ({
    ...row,
    url: `${baseUrl}/add/${row.token}`,
    event_name: nameById.get(row.event_id) ?? null,
  }))
}

export async function getMusicTracks(db: DB): Promise<{ id: string; title: string }[]> {
  const { data } = await db
    .from('music_tracks')
    .select('id, title')
    .order('sort_order')
    .order('created_at')
  return (data ?? []) as { id: string; title: string }[]
}

// ---------------------------------------------------------------------------
// Hydration — signed URLs + the human details
// ---------------------------------------------------------------------------

export async function hydrate(db: DB, rows: MediaRow[]): Promise<MediaView[]> {
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const uploaderIds = [...new Set(rows.map((r) => r.uploader_id).filter(Boolean))] as string[]
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter(Boolean))] as string[]

  const [profiles, events, reactions, comments, voices, tags] = await Promise.all([
    uploaderIds.length
      ? db.from('profiles').select('id, display_name').in('id', uploaderIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? db.from('events').select('id, name').in('id', eventIds)
      : Promise.resolve({ data: [] }),
    db.from('reactions').select('media_id').in('media_id', ids),
    db.from('comments').select('media_id').in('media_id', ids),
    db.from('voice_notes').select('media_id').in('media_id', ids),
    db.from('media_people').select('media_id, people(id, name)').in('media_id', ids),
  ])

  const nameById = new Map(
    ((profiles.data ?? []) as Pick<Profile, 'id' | 'display_name'>[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  )
  const eventById = new Map(
    ((events.data ?? []) as Pick<EventRow, 'id' | 'name'>[]).map((e) => [e.id, e.name]),
  )

  const count = (data: unknown) => {
    const tally = new Map<string, number>()
    for (const row of (data ?? []) as { media_id: string }[]) {
      tally.set(row.media_id, (tally.get(row.media_id) ?? 0) + 1)
    }
    return tally
  }
  const reactionCounts = count(reactions.data)
  const commentCounts = count(comments.data)
  const voiceCounts = count(voices.data)

  const peopleByMedia = new Map<string, { id: string; name: string }[]>()
  // PostgREST returns an embedded to-one relation as an object in some versions
  // and a single-element array in others. Accept either.
  type Tagged = { id: string; name: string }
  type TagRow = { media_id: string; people: Tagged | Tagged[] | null }
  for (const row of (tags.data ?? []) as unknown as TagRow[]) {
    const tagged = Array.isArray(row.people) ? row.people : row.people ? [row.people] : []
    if (tagged.length === 0) continue
    peopleByMedia.set(row.media_id, [...(peopleByMedia.get(row.media_id) ?? []), ...tagged])
  }

  const r2Ready = isConfigured('r2')
  const streamReady = isConfigured('stream')

  return Promise.all(
    rows.map(async (row): Promise<MediaView> => {
      let display: string | null = null
      let thumb: string | null = null
      let download: string | null = null
      let hls: string | null = null
      let iframe: string | null = null

      if (row.type === 'video' && row.stream_uid && streamReady) {
        const urls = playbackUrls(row.stream_uid)
        hls = urls.hls
        iframe = urls.iframe
        display = row.poster_url ?? urls.poster
        thumb = display
      }

      if (r2Ready) {
        const [displayUrl, thumbUrl, originalUrl] = await Promise.all([
          row.r2_display_key ? presignGet(row.r2_display_key) : null,
          row.r2_thumb_key ? presignGet(row.r2_thumb_key) : null,
          row.r2_key
            ? presignGet(row.r2_key, {
                downloadAs: row.original_filename ?? `memory-${row.id}`,
              })
            : null,
        ])
        display ??= displayUrl ?? originalUrl
        thumb ??= thumbUrl ?? displayUrl ?? originalUrl
        download = originalUrl
      }

      // Videos with no R2 original fall back to the Stream MP4 rendition.
      if (!download && row.type === 'video' && row.stream_uid && streamReady) {
        download = playbackUrls(row.stream_uid).mp4
      }

      return {
        ...row,
        uploader_name:
          (row.uploader_id ? nameById.get(row.uploader_id) : null) ??
          row.uploader_label ??
          'Someone',
        event_name: row.event_id ? (eventById.get(row.event_id) ?? null) : null,
        display_url: display,
        thumb_url: thumb,
        hls_url: hls,
        iframe_url: iframe,
        download_url: download,
        reaction_count: reactionCounts.get(row.id) ?? 0,
        comment_count: commentCounts.get(row.id) ?? 0,
        voice_note_count: voiceCounts.get(row.id) ?? 0,
        people: peopleByMedia.get(row.id) ?? [],
      }
    }),
  )
}
