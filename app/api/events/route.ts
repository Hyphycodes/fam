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
    const date = normalizeDate(eventDate)
    if (eventDate && !date) return fail('Choose a valid date.')
    const collectionKind = kind === 'event' ? 'event' : 'album'

    const db = actor.db
    let existingQuery = db.from('events').select('*').limit(100)
    existingQuery = date
      ? existingQuery.eq('event_date', date)
      : existingQuery.is('event_date', null)
    const { data: possibleMatches, error: matchError } = await existingQuery
    if (matchError) return fail(`Could not check the albums: ${matchError.message}`, 500)

    const existing = (possibleMatches ?? []).find(
      (event) => event.name.trim().toLocaleLowerCase() === title.toLocaleLowerCase(),
    )
    if (existing) return ok({ event: existing, existing: true })

    const { data, error } = await db
      .from('events')
      .insert({
        name: title.slice(0, 200),
        event_date: date,
        kind: collectionKind,
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

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return value
}
