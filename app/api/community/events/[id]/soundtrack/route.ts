import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { resolveProvider } from '@/lib/community/soundtrack'
import { isFetchableUrl } from '@/lib/community/artifacts'
import { flyerUrl } from '@/lib/community/avatars'

interface Body {
  url?: string
  manual?: boolean
  title?: string | null
  artworkUrl?: string | null
  artworkPath?: string | null
  trackCount?: number | null
}

/**
 * Attach a playlist to an event. First try the matching provider's metadata; if
 * that misses, tell the client to show manual entry instead of failing. Resolved
 * metadata is cached in the row and never refetched on render. One per event.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id: eventId } = await params
    const body = await readJson<Body>(request)
    const url = (body.url ?? '').trim()
    if (!isFetchableUrl(url)) return fail('That doesn’t look like a playlist link.')

    const { data: existing } = await actor.db
      .from('event_soundtracks')
      .select('id')
      .eq('event_id', eventId)
      .limit(1)
      .maybeSingle()
    if (existing) return fail('This event already has a soundtrack. Remove it to change it.', 409)

    const provider = resolveProvider(url)
    const providerId = provider?.id ?? 'other'
    const externalId = provider?.parse(url)?.externalId ?? null

    const manual = body.manual === true || typeof body.title === 'string'
    let title: string | null = null
    let artworkUrl: string | null = null
    let trackCount: number | null = null

    if (!manual) {
      const meta = provider ? await provider.fetchMeta(url, externalId) : null
      if (!meta || (!meta.title && !meta.artworkUrl)) {
        // No dead end: hand the client what it needs to render a manual form.
        return ok({ needsManual: true, provider: providerId })
      }
      title = meta.title
      artworkUrl = meta.artworkUrl
      trackCount = meta.trackCount
    } else {
      title = (body.title ?? '').trim().slice(0, 200) || null
      trackCount = Number.isFinite(Number(body.trackCount)) ? Number(body.trackCount) : null
      artworkUrl = body.artworkUrl ?? (body.artworkPath ? flyerUrl(body.artworkPath) : null)
    }

    const { data, error } = await actor.db
      .from('event_soundtracks')
      .insert({
        event_id: eventId,
        provider: providerId,
        external_url: url,
        external_id: externalId,
        title,
        artwork_url: artworkUrl,
        track_count: trackCount,
        curated_by_member: actor.memberId,
        curated_by: actor.userId,
      })
      .select('id')
      .single()
    if (error || !data) return fail(`Could not add that: ${error?.message ?? 'unknown'}`, 500)
    return ok({ id: data.id })
  } catch (error) {
    return handleError(error, 'community/soundtrack')
  }
}

/** Remove the event's soundtrack — a shared party detail, so any member may. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)
    const { id: eventId } = await params
    const { error } = await actor.db.from('event_soundtracks').delete().eq('event_id', eventId)
    if (error) return fail(`Could not remove that: ${error.message}`, 500)
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error, 'community/soundtrack')
  }
}
