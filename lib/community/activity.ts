import 'server-only'

import type { DB } from '@/lib/api'
import { resolveAuthors, authorOf } from '@/lib/community/actor'

export interface ActivityItem {
  id: string
  verb: string
  actor_name: string
  actor_avatar_url: string | null
  href: string
  created_at: string
}

/**
 * "Recently in the family" — the strip that makes the place feel alive the
 * moment you open it. A small union over things that already carry a timestamp:
 * new uploads, new reactions, new comments, new events. No new table, no
 * triggers — just the last few of each, merged and trimmed.
 */
export async function getRecentActivity(db: DB, limit = 10): Promise<ActivityItem[]> {
  const [media, reactions, comments, events] = await Promise.all([
    db
      .from('media')
      .select('id, type, uploader_id, uploader_member, uploader_label, created_at')
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(limit),
    db
      .from('reactions')
      .select('id, emoji, media_id, collection_id, user_id, member_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    db
      .from('comments')
      .select('id, media_id, collection_id, user_id, member_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    db
      .from('events')
      .select('id, name, created_by_member, created_at')
      .eq('kind', 'event')
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  const mediaRows = (media.data ?? []) as {
    id: string
    type: string
    uploader_id: string | null
    uploader_member: string | null
    uploader_label: string | null
    created_at: string
  }[]
  const reactionRows = (reactions.data ?? []) as {
    id: string
    emoji: string
    media_id: string | null
    collection_id: string | null
    user_id: string | null
    member_id: string | null
    created_at: string
  }[]
  const commentRows = (comments.data ?? []) as {
    id: string
    media_id: string | null
    collection_id: string | null
    user_id: string | null
    member_id: string | null
    created_at: string
  }[]
  const eventRows = (events.data ?? []) as {
    id: string
    name: string
    created_by_member: string | null
    created_at: string
  }[]

  // Resolve every actor across all four sources in two queries.
  const maps = await resolveAuthors(db, [
    ...mediaRows.map((m) => ({ user_id: m.uploader_id, member_id: m.uploader_member })),
    ...reactionRows,
    ...commentRows,
    ...eventRows.map((e) => ({ user_id: null, member_id: e.created_by_member })),
  ])

  const subjectHref = (mediaId: string | null, collectionId: string | null) =>
    mediaId ? `/m/${mediaId}` : collectionId ? `/community/${collectionId}` : '/'

  const items: ActivityItem[] = [
    ...mediaRows.map((m) => {
      const author = authorOf({ user_id: m.uploader_id, member_id: m.uploader_member }, maps)
      return {
        id: `u-${m.id}`,
        verb: `added a ${m.type === 'video' ? 'video' : 'photo'}`,
        actor_name: m.uploader_label ?? author.display_name,
        actor_avatar_url: author.avatar_url,
        href: `/m/${m.id}`,
        created_at: m.created_at,
      }
    }),
    ...reactionRows.map((r) => {
      const author = authorOf(r, maps)
      return {
        id: `r-${r.id}`,
        verb: `reacted ${r.emoji}`,
        actor_name: author.display_name,
        actor_avatar_url: author.avatar_url,
        href: subjectHref(r.media_id, r.collection_id),
        created_at: r.created_at,
      }
    }),
    ...commentRows.map((c) => {
      const author = authorOf(c, maps)
      return {
        id: `c-${c.id}`,
        verb: 'left a note',
        actor_name: author.display_name,
        actor_avatar_url: author.avatar_url,
        href: subjectHref(c.media_id, c.collection_id),
        created_at: c.created_at,
      }
    }),
    ...eventRows.map((e) => {
      const author = authorOf({ user_id: null, member_id: e.created_by_member }, maps)
      return {
        id: `e-${e.id}`,
        verb: `posted ${e.name}`,
        actor_name: author.display_name,
        actor_avatar_url: author.avatar_url,
        href: `/community/${e.id}`,
        created_at: e.created_at,
      }
    }),
  ]

  return items
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit)
}
