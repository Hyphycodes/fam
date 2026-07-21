import { fail, handleError, ok, readJson } from '@/lib/api'
import { listReactions, toggleReaction } from '@/lib/community/threads'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const reactions = await listReactions('collection', id)
    if (reactions === null) return fail('Not signed in.', 401)
    return ok({ reactions })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { emoji } = await readJson<{ emoji?: string }>(request)
    const result = await toggleReaction('collection', id, emoji ?? '')
    if (!result.ok) return fail(result.error ?? 'Could not save that.', result.status ?? 400)
    return ok({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}
