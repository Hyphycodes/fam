import { fail, handleError, ok, readJson } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { createAdminClient } from '@/lib/supabase/admin'
import { isEventStatus } from '@/lib/community/eventState'

interface Body {
  name?: string
  eventDate?: string | null
  startsAt?: string | null
  location?: string | null
  description?: string | null
  flyerPath?: string | null
  status?: string
  force?: boolean
}

/**
 * Plan an event on the board. A board post is now a *plan* by default — a flyer
 * and an idea people can react and talk under before it exists. Its intended
 * date (starts_at) is optional; "sometime this summer" is a real state. It stays
 * planned until someone marks it happened (see the [id] transition route), which
 * is when it gets a real event_date and joins the Timeline.
 *
 * Either identity works: a passcode member attributes to `created_by_member`, a
 * legacy account to the older `created_by`.
 */
export async function POST(request: Request) {
  try {
    const viewer = await getViewer()
    if (!viewer) return fail('Sign in first.', 401)

    const body = await readJson<Body>(request)
    const name = (body.name ?? '').trim().slice(0, 140)
    if (!name) return fail('Give it a name.')

    const status = isEventStatus(body.status) ? body.status : 'planned'
    const startsAt = normalizeTimestamp(body.startsAt)
    const location = (body.location ?? '').trim().slice(0, 200) || null
    const description = (body.description ?? '').trim().slice(0, 4000) || null
    // A plan hasn't happened, so it has no event_date yet — only an intent.
    // A directly-completed event keeps its given date.
    const eventDate = status === 'completed' ? normalizeDate(body.eventDate) : null
    // Something that already happened must carry a date — the DB enforces this
    // too, but say it plainly here rather than surfacing a constraint error.
    if (status === 'completed' && !eventDate) {
      return fail('Something that already happened needs a date.')
    }

    const admin = createAdminClient()

    // Soft guard: a similarly-named event within ±3 days is probably the same
    // night (the "Water Party" / "Hyphy Water Party" problem). Warn, don't block.
    const referenceDay = eventDate ?? (startsAt ? startsAt.slice(0, 10) : null)
    if (!body.force && referenceDay) {
      const { data: nearby } = await admin
        .from('events')
        .select('id, name, event_date, starts_at')
        .is('merged_into', null)
      const similar = (nearby ?? []).find((event) => {
        if (event.name.trim().toLowerCase() === name.toLowerCase()) return withinDays(event, referenceDay)
        const a = name.toLowerCase()
        const b = (event.name ?? '').toLowerCase()
        const overlaps = a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a))
        return overlaps && withinDays(event, referenceDay)
      })
      if (similar) {
        return ok({
          warning: `“${similar.name}” already exists around then — same event?`,
          similar: { id: similar.id, name: similar.name },
        })
      }
    }

    const { data, error } = await admin
      .from('events')
      .insert({
        name,
        event_date: eventDate,
        starts_at: startsAt,
        location,
        description,
        flyer_path: body.flyerPath ?? null,
        kind: 'event',
        status,
        created_by_member: viewer.kind === 'member' ? viewer.memberId : null,
        created_by: viewer.kind === 'legacy' ? viewer.id : null,
      })
      .select('id')
      .single()

    if (error || !data) return fail(`Could not post that: ${error?.message ?? 'unknown'}`, 500)
    return ok({ id: data.id })
  } catch (error) {
    return handleError(error, 'community/events')
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

/** Is an existing event's date within ±3 days of the reference day (YYYY-MM-DD)? */
function withinDays(event: { event_date: string | null; starts_at: string | null }, referenceDay: string): boolean {
  const other = event.event_date ?? (event.starts_at ? event.starts_at.slice(0, 10) : null)
  if (!other) return false
  const days = Math.abs(Date.parse(`${other}T00:00:00Z`) - Date.parse(`${referenceDay}T00:00:00Z`)) / 86_400_000
  return days <= 3
}

/** A YYYY-MM-DD intended date becomes a noon-UTC timestamp; ISO passes through. */
function normalizeTimestamp(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00Z` : trimmed
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
