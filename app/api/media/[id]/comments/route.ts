import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await getSession())) return fail('Not signed in.', 401)
    const { id } = await params
    const db = await createClient()

    const { data } = await db
      .from('comments')
      .select('id, body, user_id, created_at')
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
      comments: rows.map((c) => ({ ...c, name: nameById.get(c.user_id) ?? 'Someone' })),
    })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { id } = await params
    const { body } = await readJson<{ body?: string }>(request)
    const text = (body ?? '').trim()

    if (!text) return fail('Say something first.')
    if (text.length > 2000) return fail('That is longer than a comment wants to be.')

    const db = await createClient()
    const { data, error } = await db
      .from('comments')
      .insert({ media_id: id, user_id: session.userId, body: text })
      .select('id, body, user_id, created_at')
      .single()

    if (error) return fail(`Could not post that: ${error.message}`, 500)
    return ok({ comment: { ...data, name: session.profile.display_name } })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const commentId = new URL(request.url).searchParams.get('comment')
    if (!commentId) return fail('Which comment?')

    const db = await createClient()
    const { error } = await db.from('comments').delete().eq('id', commentId)
    if (error) return fail(`Could not remove that: ${error.message}`, 500)
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error)
  }
}
