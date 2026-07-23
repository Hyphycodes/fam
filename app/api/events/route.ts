import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { getViewer } from '@/lib/viewer'
import { getEvents } from '@/lib/queries'
import { readDb } from '@/lib/db'

/** The event list for pickers (upload details, editing) — any viewer. */
export async function GET() {
  try {
    if (!(await getViewer())) return fail('Not signed in.', 401)
    return ok({ events: await getEvents(readDb()) })
  } catch (error) {
    return handleError(error, 'events')
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { name, eventDate, kind } = await readJson<{
      name?: string
      eventDate?: string
      kind?: 'album' | 'event'
    }>(request)
    const title = (name ?? '').trim()
    if (!title) return fail('Enter a name.')

    const db = actor.db
    const { data, error } = await db
      .from('events')
      .insert({
        name: title.slice(0, 200),
        event_date: eventDate || null,
        kind: kind === 'event' ? 'event' : 'album',
        created_by: actor.userId,
        created_by_member: actor.memberId,
      })
      .select('*')
      .single()

    if (error) return fail(`Could not create that: ${error.message}`, 500)
    return ok({ event: data })
  } catch (error) {
    return handleError(error, 'events')
  }
}
