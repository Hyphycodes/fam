import { handleError, ok, fail } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getFeed } from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/server'

/** Infinite scroll. Cursor is the `created_at` of the last row you were given. */
export async function GET(request: Request) {
  try {
    // A 401 here, not a redirect — this is fetched, and an HTML login page
    // would be a baffling thing to receive from a JSON endpoint.
    if (!(await getSession())) return fail('Not signed in.', 401)

    await reconcileProcessingVideos()

    const url = new URL(request.url)
    const db = await createClient()

    const media = await getFeed(db, {
      limit: Math.min(Number(url.searchParams.get('limit')) || 18, 60),
      before: url.searchParams.get('before'),
      eventId: url.searchParams.get('event'),
      personId: url.searchParams.get('person'),
      year: Number(url.searchParams.get('year')) || null,
      favorite: url.searchParams.get('favorite') === '1',
    })

    return ok({
      media,
      nextCursor: media.length ? media[media.length - 1].created_at : null,
    })
  } catch (error) {
    return handleError(error)
  }
}
