import { fail, handleError, ok } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { readDb } from '@/lib/db'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { getTimelinePage, type TimelineCursor } from '@/lib/timeline'

/** Keyset-paginated timeline. Cursor is the (taken_at, id) of the last row seen. */
export async function GET(request: Request) {
  try {
    if (!(await getViewer())) return fail('Not signed in.', 401)
    await reconcileProcessingVideos()

    const { searchParams } = new URL(request.url)
    const before = searchParams.get('before')
    const beforeId = searchParams.get('beforeId')
    const cursor: TimelineCursor | null =
      before && beforeId ? { takenAt: before, id: beforeId } : null

    const type = searchParams.get('type')
    const person = searchParams.get('person')

    const page = await getTimelinePage(readDb(), {
      cursor,
      limit: Math.min(Number(searchParams.get('limit')) || 48, 120),
      type: type === 'photo' || type === 'video' ? type : null,
      personId: person || null,
    })

    return ok(page)
  } catch (error) {
    return handleError(error, 'timeline')
  }
}
