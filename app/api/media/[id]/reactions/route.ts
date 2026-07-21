import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const ALLOWED = ['❤️', '😂', '🔥', '🥹', '👏', '😮']

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await getSession())) return fail('Not signed in.', 401)
    const { id } = await params
    const db = await createClient()

    const { data } = await db
      .from('reactions')
      .select('id, emoji, user_id, created_at')
      .eq('media_id', id)
      .order('created_at')

    const rows = data ?? []
    const userIds = [...new Set(rows.map((r) => r.user_id))]
    const { data: profiles } = userIds.length
      ? await db.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [] }

    const nameById = new Map(
      (profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]),
    )

    return ok({
      reactions: rows.map((r) => ({ ...r, name: nameById.get(r.user_id) ?? 'Someone' })),
    })
  } catch (error) {
    return handleError(error)
  }
}

/** Toggles — tapping the same emoji twice takes it back. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { id } = await params
    const { emoji } = await readJson<{ emoji?: string }>(request)
    if (!emoji || !ALLOWED.includes(emoji)) return fail('That is not one of the reactions.')

    const db = await createClient()
    const { data: existing } = await db
      .from('reactions')
      .select('id')
      .eq('media_id', id)
      .eq('user_id', session.userId)
      .eq('emoji', emoji)
      .maybeSingle()

    if (existing) {
      await db.from('reactions').delete().eq('id', existing.id)
      return ok({ reacted: false })
    }

    const { error } = await db
      .from('reactions')
      .insert({ media_id: id, user_id: session.userId, emoji })

    if (error) return fail(`Could not save that: ${error.message}`, 500)
    return ok({ reacted: true })
  } catch (error) {
    return handleError(error)
  }
}
