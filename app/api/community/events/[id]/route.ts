import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { transitionEvent } from '@/lib/community/eventState'
import { getCollectionById } from '@/lib/community/events'

interface Body {
  status?: string
  actualDate?: string | null
}

/** Move an event through its lifecycle. Every rule lives in transitionEvent(). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const body = await readJson<Body>(request)
    if (!body.status) return fail('No new state was given.')

    const result = await transitionEvent(actor, id, body.status, {
      actualDate: body.actualDate ?? null,
    })
    if (!result.ok) return fail(result.error ?? 'Could not update that event.', result.status ?? 400)

    const event = await getCollectionById(actor.db, id)
    return ok({ event, from: result.from, to: result.to })
  } catch (error) {
    return handleError(error, 'community/events/transition')
  }
}
