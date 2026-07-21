import { fail, handleError, ok } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getFeed } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * The reel for Movie Mode.
 *
 * Hands back a big batch in one go so playback never stalls waiting on a fetch
 * mid-crossfade, and signs the URLs generously — this runs unattended on a
 * projector for hours.
 */
export async function GET(request: Request) {
  try {
    if (!(await getSession())) return fail('Not signed in.', 401)

    const url = new URL(request.url)
    const db = await createClient()

    const media = await getFeed(db, {
      limit: 400,
      order: 'taken',
      eventId: url.searchParams.get('event'),
      personId: url.searchParams.get('person'),
      year: Number(url.searchParams.get('year')) || null,
      favorite: url.searchParams.get('flavor') === 'funny',
    })

    return ok({ media })
  } catch (error) {
    return handleError(error)
  }
}
