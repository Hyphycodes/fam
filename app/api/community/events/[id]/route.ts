import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor, type Actor } from '@/lib/community/actor'
import { transitionEvent } from '@/lib/community/eventState'
import { getCollectionById } from '@/lib/community/events'

interface Body {
  // Status (the state machine — the one place status moves).
  status?: string
  actualDate?: string | null
  // Field edits — any provided field is updated; omitted fields are untouched.
  name?: string
  eventDate?: string | null
  startsAt?: string | null
  description?: string | null
  location?: string | null
  coverMediaId?: string | null
}

/**
 * Edit an event. Status changes run through transitionEvent() (still the only
 * place status moves, in either direction); every other field is a direct,
 * provenance-stamped update. Editing is a primary action here — this archive
 * gets corrected constantly — so any signed-in member may edit, and who last
 * touched it is recorded and shown.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const body = await readJson<Body>(request)

    if (body.status) {
      const result = await transitionEvent(actor, id, body.status, {
        actualDate: body.actualDate ?? null,
      })
      if (!result.ok) return fail(result.error ?? 'Could not update that event.', result.status ?? 400)
    }

    const fields = await applyFieldEdits(actor, id, body)
    if (fields && !fields.ok) return fail(fields.error, fields.status)

    if (!body.status && !fields) return fail('Nothing to change.')

    const event = await getCollectionById(actor.db, id)
    if (!event) return fail('That event no longer exists.', 404)
    return ok({ event })
  } catch (error) {
    return handleError(error, 'community/events/update')
  }
}

type FieldResult = { ok: true } | { ok: false; error: string; status: number } | null

/** Apply whatever fields the body carries; returns null when it carries none. */
async function applyFieldEdits(actor: Actor, id: string, body: Body): Promise<FieldResult> {
  const changes: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return { ok: false, error: 'Give it a name.', status: 400 }
    changes.name = name
  }
  if (body.description !== undefined) changes.description = body.description?.trim() || null
  if (body.location !== undefined) changes.location = body.location?.trim() || null
  if (body.eventDate !== undefined) changes.event_date = normalizeDay(body.eventDate)
  if (body.startsAt !== undefined) changes.starts_at = body.startsAt || null

  if (body.coverMediaId !== undefined) {
    if (body.coverMediaId) {
      // A cover can only be one of the event's own ready frames.
      const { data } = await actor.db
        .from('media')
        .select('id')
        .eq('id', body.coverMediaId)
        .eq('event_id', id)
        .eq('status', 'ready')
        .maybeSingle()
      if (!data) return { ok: false, error: 'Pick a photo from this event.', status: 400 }
      changes.cover_media_id = body.coverMediaId
    } else {
      changes.cover_media_id = null // clear → auto-resolve
    }
  }

  if (Object.keys(changes).length === 0) return null

  // A completed event must keep a date — the DB enforces it, but say so kindly.
  if (changes.event_date === null) {
    const { data: current } = await actor.db
      .from('events')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (current?.status === 'completed') {
      return { ok: false, error: 'A completed event needs a date.', status: 400 }
    }
  }

  changes.last_edited_at = new Date().toISOString()
  if (actor.memberId) changes.last_edited_by_member = actor.memberId
  else if (actor.userId) changes.last_edited_by = actor.userId

  const { error } = await actor.db.from('events').update(changes).eq('id', id)
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true }
}

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
