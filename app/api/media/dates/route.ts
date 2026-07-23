import { fail, handleError, ok, readJson } from '@/lib/api'
import { isCapturePrecision } from '@/lib/format'
import { getActor } from '@/lib/community/actor'

interface Body {
  ids?: unknown
  takenAt?: string
  precision?: string
}

/**
 * Set one capture date + precision across a whole selection in a single
 * statement — the only sane way to date 200 VHS stills. Editing metadata is
 * collaborative in this app (only deletes are restricted), so any signed-in
 * member may do it, exactly like the single-item editor. A hand-set date is a
 * person's call, so the source becomes 'user' and no later job overwrites it.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const body = await readJson<Body>(request)
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string'))].slice(0, 500)
      : []
    if (ids.length === 0) return fail('Nothing was selected.')

    const date = body.takenAt ? new Date(body.takenAt) : null
    if (!date || Number.isNaN(date.getTime())) return fail('That date could not be read.')
    if (date.getTime() > Date.now() + 86_400_000) return fail('That date is in the future.')
    if (date.getTime() < Date.UTC(1800, 0, 1)) return fail('That date is too far back.')
    const precision = isCapturePrecision(body.precision) ? body.precision : 'day'

    // One UPDATE ... WHERE id IN (...) — atomic across the whole selection.
    const { data, error } = await actor.db
      .from('media')
      .update({
        taken_at: date.toISOString(),
        taken_precision: precision,
        taken_source: 'user',
      })
      .in('id', ids)
      .select('id')

    if (error) return fail(`Could not set those dates: ${error.message}`, 500)
    return ok({ updated: data?.length ?? 0, ids: (data ?? []).map((row) => row.id) })
  } catch (error) {
    return handleError(error, 'media/dates')
  }
}
