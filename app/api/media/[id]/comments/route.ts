import { fail, handleError, ok, readJson } from '@/lib/api'
import { addComment, deleteComment, listComments } from '@/lib/community/threads'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const comments = await listComments('media', id)
    if (comments === null) return fail('Not signed in.', 401)
    return ok({ comments })
  } catch (error) {
    return handleError(error, 'media/comments')
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { body } = await readJson<{ body?: string }>(request)
    const result = await addComment('media', id, body ?? '')
    if (!result.comment) return fail(result.error ?? 'Could not post that.', result.status ?? 400)
    return ok({ comment: result.comment })
  } catch (error) {
    return handleError(error, 'media/comments')
  }
}

export async function DELETE(request: Request) {
  try {
    const commentId = new URL(request.url).searchParams.get('comment')
    if (!commentId) return fail('Which comment?')
    const result = await deleteComment(commentId)
    if (!result.ok) return fail(result.error ?? 'Could not remove that.', result.status ?? 400)
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error, 'media/comments')
  }
}
