import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isConfigured } from '@/lib/env'
import { presignGet } from '@/lib/r2'
import { playbackUrls } from '@/lib/stream'
import { avatarUrl } from '@/lib/community/avatars'
import type { EventRow, MediaRow, MediaView, Person, Profile, TaggedPerson } from '@/lib/types'

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
  /** Ready media that has not been filed into an album or event yet. */
  unfiled?: boolean
  personId?: string | null
  year?: number | null
  favorite?: boolean
  uploaderId?: string | null
  uploaderMemberId?: string | null
  mediaType?: 'photo' | 'video' | null
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
  if (options.unfiled) query = query.is('event_id', null)
  if (options.year) query = query.eq('taken_year', options.year)
  if (options.favorite) query = query.eq('favorite', true)
  if (options.uploaderId) query = query.eq('uploader_id', options.uploaderId)
  if (options.uploaderMemberId) query = query.eq('uploader_member', options.uploaderMemberId)
  if (options.mediaType) query = query.eq('type', options.mediaType)

  const { data, error } = await query
  if (error) throw new Error(`Could not load the feed: ${error.message}`)

  // Drop the join rows — they exist only to filter, and would otherwise ride
  // along on every MediaView.
  const rowsById = new Map<string, MediaRow>()
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const { media_people, ...media } = row
    void media_people
    const item = media as unknown as MediaRow
    // Some PostgREST join shapes can repeat a parent row when a tag relation is
    // filtered. A general feed must still render one item once.
    rowsById.set(item.id, item)
  }
  const rows = [...rowsById.values()]

  return hydrate(db, rows)
}

export async function getMediaById(db: DB, id: string): Promise<MediaView | null> {
  const { data, error } = await db.from('media').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Could not load that memory: ${error.message}`)
  if (!data) return null
  const [view] = await hydrate(db, [data as MediaRow])
  return view ?? null
}

/** Memories from this day in earlier years. Approximate dates (year/month
 *  precision) are excluded — an anniversary claim needs day-level confidence. */
export async function getOnThisDay(db: DB): Promise<MediaView[]> {
  const now = new Date()
  const { data, error } = await db
    .from('media')
    .select('*')
    .eq('status', 'ready')
    .eq('taken_month', now.getMonth() + 1)
    .eq('taken_day', now.getDate())
    .neq('taken_year', now.getFullYear())
    .in('taken_precision', ['exact', 'day'])
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
  // Planned events are not albums you file media into — they live on the Board
  // until they happen. Everything else (completed events, albums) is fair game.
  const { data: events } = await db
    .from('events')
    .select('*')
    .neq('status', 'planned')
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const rows = (events ?? []) as EventRow[]
  if (rows.length === 0) return []

  const { data: counts } = await db
    .from('media')
    .select('event_id')
    .eq('status', 'ready')
    .in(
      'event_id',
      rows.map((e) => e.id),
    )

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

  // Counts should describe memories a family member can actually open. Tags on
  // an upload that is still processing (or failed) must not inflate Browse.
  const { data: links } = await db
    .from('media_people')
    .select('person_id, media!inner(status)')
    .eq('media.status', 'ready')
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

/**
 * One real frame for each Browse collection.
 *
 * We select only ids while deciding which frame represents a collection, then
 * hydrate the small set of winners. That keeps signed-URL work proportional to
 * the number of collection cards rather than the size of the archive.
 */
export async function getBrowseCovers(
  db: DB,
  collections: {
    people: { id: string }[]
    events: Pick<EventRow, 'id' | 'cover_media_id'>[]
    years: { year: number }[]
  },
): Promise<{
  people: Map<string, MediaView>
  events: Map<string, MediaView>
  years: Map<number, MediaView>
}> {
  const empty = {
    people: new Map<string, MediaView>(),
    events: new Map<string, MediaView>(),
    years: new Map<number, MediaView>(),
  }

  if (
    collections.people.length === 0 &&
    collections.events.length === 0 &&
    collections.years.length === 0
  ) {
    return empty
  }

  // Two thousand compact rows covers an archive far larger than the UI loads
  // at once without presigning thousands of private assets.
  const { data: candidateData } = await db
    .from('media')
    .select('id, event_id, taken_year, created_at')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(2000)

  const candidates = (candidateData ?? []) as {
    id: string
    event_id: string | null
    taken_year: number
    created_at: string
  }[]
  if (candidates.length === 0) return empty

  const personIds = new Set(collections.people.map((person) => person.id))
  const candidateIds = new Set(candidates.map((media) => media.id))
  const { data: tagData } = collections.people.length
    ? await db
        .from('media_people')
        .select('media_id, person_id')
        .in('person_id', [...personIds])
    : { data: [] }

  const peopleByMedia = new Map<string, string[]>()
  for (const tag of (tagData ?? []) as { media_id: string; person_id: string }[]) {
    if (!candidateIds.has(tag.media_id)) continue
    peopleByMedia.set(tag.media_id, [...(peopleByMedia.get(tag.media_id) ?? []), tag.person_id])
  }

  const personCoverIds = new Map<string, string>()
  const eventCoverIds = new Map<string, string>()
  const yearCoverIds = new Map<number, string>()

  // A deliberately chosen event cover wins. Other collections use their most
  // recently added real memory, which is predictable and easy to understand.
  for (const event of collections.events) {
    if (event.cover_media_id) eventCoverIds.set(event.id, event.cover_media_id)
  }

  for (const media of candidates) {
    if (media.event_id && !eventCoverIds.has(media.event_id)) {
      eventCoverIds.set(media.event_id, media.id)
    }
    if (!yearCoverIds.has(media.taken_year)) yearCoverIds.set(media.taken_year, media.id)
    for (const personId of peopleByMedia.get(media.id) ?? []) {
      if (!personCoverIds.has(personId)) personCoverIds.set(personId, media.id)
    }
  }

  const coverIds = [
    ...new Set([...personCoverIds.values(), ...eventCoverIds.values(), ...yearCoverIds.values()]),
  ]
  if (coverIds.length === 0) return empty

  const { data: coverRows } = await db
    .from('media')
    .select('*')
    .eq('status', 'ready')
    .in('id', coverIds)

  const views = await hydrate(db, (coverRows ?? []) as MediaRow[])
  const byId = new Map(views.map((view) => [view.id, view]))

  for (const [personId, mediaId] of personCoverIds) {
    const view = byId.get(mediaId)
    if (view) empty.people.set(personId, view)
  }
  for (const [eventId, mediaId] of eventCoverIds) {
    const view = byId.get(mediaId)
    if (view) empty.events.set(eventId, view)
  }
  for (const [year, mediaId] of yearCoverIds) {
    const view = byId.get(mediaId)
    if (view) empty.years.set(year, view)
  }

  return empty
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
    .in(
      'id',
      rows.map((r) => r.event_id),
    )

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

/** A filesystem-safe, human-legible download name from a memory's metadata. */
function buildDownloadName(
  takenAt: string,
  eventName: string | null | undefined,
  names: string[],
  ext: string,
  fallbackId: string,
): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)

  const date = new Date(takenAt)
  const day = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  const parts = [
    eventName ? slug(eventName) : 'memory',
    day,
    names.length ? slug(names.slice(0, 3).join('-')) : '',
  ].filter(Boolean)

  const stem = parts.join('_') || `memory-${fallbackId}`
  return `${stem}${ext}`
}

export async function hydrate(db: DB, rows: MediaRow[]): Promise<MediaView[]> {
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const uploaderIds = [...new Set(rows.map((r) => r.uploader_id).filter(Boolean))] as string[]
  const uploaderMemberIds = [
    ...new Set(rows.map((r) => r.uploader_member).filter(Boolean)),
  ] as string[]
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter(Boolean))] as string[]

  const [profiles, events, reactions, comments, voices, tags] = await Promise.all([
    uploaderIds.length
      ? db.from('profiles').select('id, display_name, avatar_url').in('id', uploaderIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? db.from('events').select('id, name').in('id', eventIds)
      : Promise.resolve({ data: [] }),
    db.from('reactions').select('media_id').in('media_id', ids),
    db.from('comments').select('media_id').in('media_id', ids),
    db.from('voice_notes').select('media_id').in('media_id', ids),
    db
      .from('media_people')
      .select('media_id, people(id, name, member_id, profile_id)')
      .in('media_id', ids),
  ])

  const nameById = new Map(
    ((profiles.data ?? []) as Pick<Profile, 'id' | 'display_name'>[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  )
  // A legacy uploader's own profile photo, for parity with a member's avatar.
  const legacyAvatarById = new Map(
    ((profiles.data ?? []) as Pick<Profile, 'id' | 'avatar_url'>[]).map((p) => [
      p.id,
      avatarUrl(p.avatar_url),
    ]),
  )
  const eventById = new Map(
    ((events.data ?? []) as Pick<EventRow, 'id' | 'name'>[]).map((e) => [e.id, e.name]),
  )

  // Community members: uploaders and tagged people alike resolve to a name and
  // an avatar. Collected in one pass so a feed page presigns nothing extra.
  const taggedMemberIds = new Set<string>()
  type TagPersonRow = {
    id: string
    name: string
    member_id: string | null
    profile_id: string | null
  }
  for (const row of (tags.data ?? []) as { people: TagPersonRow | TagPersonRow[] | null }[]) {
    const list = Array.isArray(row.people) ? row.people : row.people ? [row.people] : []
    for (const p of list) if (p.member_id) taggedMemberIds.add(p.member_id)
  }
  const memberIdsToLoad = [...new Set([...uploaderMemberIds, ...taggedMemberIds])]
  const { data: memberRows } = memberIdsToLoad.length
    ? await db.from('members').select('id, display_name, avatar_path').in('id', memberIdsToLoad)
    : { data: [] }
  const memberById = new Map(
    ((memberRows ?? []) as { id: string; display_name: string; avatar_path: string | null }[]).map(
      (m) => [m.id, { display_name: m.display_name, avatar_url: avatarUrl(m.avatar_path) }],
    ),
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

  const peopleByMedia = new Map<string, TaggedPerson[]>()
  // PostgREST returns an embedded to-one relation as an object in some versions
  // and a single-element array in others. Accept either.
  type Tagged = {
    id: string
    name: string
    member_id: string | null
    profile_id: string | null
  }
  type TagRow = { media_id: string; people: Tagged | Tagged[] | null }
  for (const row of (tags.data ?? []) as unknown as TagRow[]) {
    const tagged = Array.isArray(row.people) ? row.people : row.people ? [row.people] : []
    if (tagged.length === 0) continue
    const resolved: TaggedPerson[] = tagged.map((p) => {
      const member = p.member_id ? memberById.get(p.member_id) : null
      return {
        id: p.id,
        // A member's chosen display name wins over the tag's stored text.
        name: member?.display_name ?? p.name,
        member_id: p.member_id,
        profile_id: p.profile_id,
        avatar_url: member?.avatar_url ?? null,
      }
    })
    peopleByMedia.set(row.media_id, [...(peopleByMedia.get(row.media_id) ?? []), ...resolved])
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

      // A descriptive filename so a saved copy carries who/when/where instead
      // of "IMG_4032.jpg": "sofias-birthday_2019-07-04_kamila-nick.jpg". Used
      // both for R2's Content-Disposition and, client-side, as the name for a
      // File handed to the Web Share API when saving straight to Photos.
      const ext =
        row.type === 'video'
          ? '.mp4'
          : (row.original_filename?.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase()
      const eventName = row.event_id ? eventById.get(row.event_id) : null
      const names = (peopleByMedia.get(row.id) ?? []).map((p) => p.name)
      const downloadAs = buildDownloadName(row.taken_at, eventName, names, ext, row.id)

      if (r2Ready) {
        const [displayUrl, thumbUrl, originalUrl] = await Promise.all([
          row.r2_display_key ? presignGet(row.r2_display_key) : null,
          row.r2_thumb_key ? presignGet(row.r2_thumb_key) : null,
          row.r2_key ? presignGet(row.r2_key, { downloadAs }) : null,
        ])
        display ??= displayUrl ?? originalUrl
        thumb ??= thumbUrl ?? displayUrl ?? originalUrl
        download = originalUrl
      }

      // Videos with no R2 original fall back to the Stream MP4 rendition.
      if (!download && row.type === 'video' && row.stream_uid && streamReady) {
        download = playbackUrls(row.stream_uid).mp4
      }

      const member = row.uploader_member ? memberById.get(row.uploader_member) : null

      return {
        ...row,
        uploader_name:
          member?.display_name ??
          (row.uploader_id ? nameById.get(row.uploader_id) : null) ??
          row.uploader_label ??
          'Someone',
        uploader_avatar_url:
          member?.avatar_url ??
          (row.uploader_id ? (legacyAvatarById.get(row.uploader_id) ?? null) : null),
        event_name: row.event_id ? (eventById.get(row.event_id) ?? null) : null,
        display_url: display,
        thumb_url: thumb,
        hls_url: hls,
        iframe_url: iframe,
        download_url: download,
        download_filename: download ? downloadAs : null,
        reaction_count: reactionCounts.get(row.id) ?? 0,
        comment_count: commentCounts.get(row.id) ?? 0,
        voice_note_count: voiceCounts.get(row.id) ?? 0,
        people: peopleByMedia.get(row.id) ?? [],
      }
    }),
  )
}
