import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BATCH = 200

/**
 * Files existing memories into one album/event in a single database update.
 * The same endpoint powers post-upload organization and keeps large imports
 * from requiring one request per memory.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const body = await readJson<{ albumId?: string; mediaIds?: string[] }>(request)
    const albumId = body.albumId?.trim() ?? ''
    const mediaIds = [
      ...new Set((body.mediaIds ?? []).filter((id): id is string => typeof id === 'string')),
    ].filter((id) => UUID.test(id))

    if (!UUID.test(albumId)) return fail('Choose an album first.')
    if (mediaIds.length === 0) return fail('Choose at least one memory.')
    if (mediaIds.length > MAX_BATCH) {
      return fail(`Choose ${MAX_BATCH} memories or fewer at a time.`)
    }

    const { data: album, error: albumError } = await actor.db
      .from('events')
      .select('id, name')
      .eq('id', albumId)
      .maybeSingle()
    if (albumError) return fail(`Could not open that album: ${albumError.message}`, 500)
    if (!album) return fail('That album is no longer available.', 404)

    const { data: updated, error } = await actor.db
      .from('media')
      .update({ event_id: albumId })
      .in('id', mediaIds)
      .eq('status', 'ready')
      .select('id')

    if (error) return fail(`Could not file those memories: ${error.message}`, 500)

    return ok({
      album,
      assigned: updated?.length ?? 0,
      mediaIds: (updated ?? []).map((row) => row.id as string),
    })
  } catch (error) {
    return handleError(error, 'albums/assign')
  }
}
