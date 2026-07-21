import 'server-only'

import { getActor, resolveAuthors, authorOf } from '@/lib/community/actor'
import { subjectColumn, type SubjectKind } from '@/lib/community/subject'

const ALLOWED_EMOJI = ['❤️', '😂', '🔥', '🥹', '👏', '😮']

export interface ReactionView {
  id: string
  emoji: string
  name: string
  avatar_url: string | null
  mine: boolean
}

export interface CommentView {
  id: string
  body: string
  name: string
  avatar_url: string | null
  created_at: string
  mine: boolean
}

/** All reactions on a subject, each resolved to a name + avatar + "is it mine". */
export async function listReactions(
  kind: SubjectKind,
  subjectId: string,
): Promise<ReactionView[] | null> {
  const actor = await getActor()
  if (!actor) return null
  const col = subjectColumn(kind)

  const { data } = await actor.db
    .from('reactions')
    .select('id, emoji, user_id, member_id, created_at')
    .eq(col, subjectId)
    .order('created_at')

  const rows = (data ?? []) as {
    id: string
    emoji: string
    user_id: string | null
    member_id: string | null
    created_at: string
  }[]
  const maps = await resolveAuthors(actor.db, rows)

  return rows.map((r) => {
    const author = authorOf(r, maps)
    return { id: r.id, emoji: r.emoji, name: author.display_name, avatar_url: author.avatar_url, mine: actor.owns(r) }
  })
}

export async function toggleReaction(
  kind: SubjectKind,
  subjectId: string,
  emoji: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not signed in.', status: 401 }
  if (!ALLOWED_EMOJI.includes(emoji)) return { ok: false, error: 'That is not one of the reactions.', status: 400 }
  const col = subjectColumn(kind)

  let query = actor.db.from('reactions').select('id').eq(col, subjectId).eq('emoji', emoji)
  query = actor.memberId ? query.eq('member_id', actor.memberId) : query.eq('user_id', actor.userId!)
  const { data: existing } = await query.maybeSingle()

  if (existing) {
    await actor.db.from('reactions').delete().eq('id', existing.id)
    return { ok: true }
  }

  const { error } = await actor.db
    .from('reactions')
    .insert({ [col]: subjectId, emoji, ...actor.attribution() })
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true }
}

export async function listComments(
  kind: SubjectKind,
  subjectId: string,
): Promise<CommentView[] | null> {
  const actor = await getActor()
  if (!actor) return null
  const col = subjectColumn(kind)

  const { data } = await actor.db
    .from('comments')
    .select('id, body, user_id, member_id, created_at')
    .eq(col, subjectId)
    .order('created_at')

  const rows = (data ?? []) as {
    id: string
    body: string
    user_id: string | null
    member_id: string | null
    created_at: string
  }[]
  const maps = await resolveAuthors(actor.db, rows)

  return rows.map((c) => {
    const author = authorOf(c, maps)
    return {
      id: c.id,
      body: c.body,
      name: author.display_name,
      avatar_url: author.avatar_url,
      created_at: c.created_at,
      mine: actor.owns(c),
    }
  })
}

export async function addComment(
  kind: SubjectKind,
  subjectId: string,
  bodyRaw: string,
): Promise<{ comment?: CommentView; error?: string; status?: number }> {
  const actor = await getActor()
  if (!actor) return { error: 'Not signed in.', status: 401 }
  const text = bodyRaw.trim()
  if (!text) return { error: 'Say something first.', status: 400 }
  if (text.length > 2000) return { error: 'That is longer than a comment wants to be.', status: 400 }
  const col = subjectColumn(kind)

  const { data, error } = await actor.db
    .from('comments')
    .insert({ [col]: subjectId, body: text, ...actor.attribution() })
    .select('id, body, created_at')
    .single()
  if (error || !data) return { error: error?.message ?? 'Could not post that.', status: 500 }

  return {
    comment: {
      id: data.id,
      body: data.body,
      name: actor.display_name,
      avatar_url: actor.avatar_url,
      created_at: data.created_at,
      mine: true,
    },
  }
}

export async function deleteComment(
  commentId: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not signed in.', status: 401 }

  const { data: row } = await actor.db
    .from('comments')
    .select('id, user_id, member_id')
    .eq('id', commentId)
    .maybeSingle()
  if (!row) return { ok: true } // already gone
  if (!actor.owns(row) && !actor.isOwner) return { ok: false, error: 'That is not yours to remove.', status: 403 }

  await actor.db.from('comments').delete().eq('id', commentId)
  return { ok: true }
}

export { ALLOWED_EMOJI }
