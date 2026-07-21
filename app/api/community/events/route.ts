import { fail, handleError, ok, readJson } from '@/lib/api'
import { getMember } from '@/lib/member'
import { createAdminClient } from '@/lib/supabase/admin'

interface Body {
  name?: string
  eventDate?: string | null
  description?: string | null
  flyerPath?: string | null
}

/**
 * Post an event to the board. Creating it *is* creating its album — the same
 * collection everyone uploads photos into afterward. Any member can post.
 */
export async function POST(request: Request) {
  try {
    const member = await getMember()
    if (!member) return fail('Sign in first.', 401)

    const body = await readJson<Body>(request)
    const name = (body.name ?? '').trim().slice(0, 140)
    if (!name) return fail('Give the event a name.')

    const eventDate = normalizeDate(body.eventDate)
    const description = (body.description ?? '').trim().slice(0, 4000) || null

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('events')
      .insert({
        name,
        event_date: eventDate,
        description,
        flyer_path: body.flyerPath ?? null,
        kind: 'event',
        created_by_member: member.id,
      })
      .select('id')
      .single()

    if (error || !data) return fail(`Could not post that: ${error?.message ?? 'unknown'}`, 500)
    return ok({ id: data.id })
  } catch (error) {
    return handleError(error)
  }
}

/** Accept a plain YYYY-MM-DD; reject anything that isn't a real date. */
function normalizeDate(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const date = new Date(`${trimmed}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : trimmed
}
