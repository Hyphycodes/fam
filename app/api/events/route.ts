import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getEvents } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    if (!(await getSession())) return fail('Not signed in.', 401)
    return ok({ events: await getEvents(await createClient()) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { name, eventDate } = await readJson<{ name?: string; eventDate?: string }>(request)
    const title = (name ?? '').trim()
    if (!title) return fail('Give it a name — "Water Party", "Christmas at Mom\'s".')

    const db = await createClient()
    const { data, error } = await db
      .from('events')
      .insert({
        name: title.slice(0, 200),
        event_date: eventDate || null,
        created_by: session.userId,
      })
      .select('*')
      .single()

    if (error) return fail(`Could not create that: ${error.message}`, 500)
    return ok({ event: data })
  } catch (error) {
    return handleError(error)
  }
}
