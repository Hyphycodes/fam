import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getMediaById } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteVideo } from '@/lib/stream'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await getSession())) return fail('Not signed in.', 401)
    const { id } = await params
    const media = await getMediaById(await createClient(), id)
    if (!media) return fail('That memory is not here.', 404)
    return ok({ media })
  } catch (error) {
    return handleError(error)
  }
}

interface Patch {
  caption?: string | null
  favorite?: boolean
  eventId?: string | null
  takenAt?: string
  people?: string[]
}

/** Caption it, star it, file it under an event, say who's in it. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { id } = await params
    const body = await readJson<Patch>(request)
    const db = await createClient()

    const changes: Record<string, unknown> = {}
    if ('caption' in body) changes.caption = (body.caption ?? '').trim().slice(0, 2000) || null
    if ('favorite' in body) changes.favorite = Boolean(body.favorite)
    if ('eventId' in body) changes.event_id = body.eventId || null
    if (body.takenAt) {
      const date = new Date(body.takenAt)
      if (!Number.isNaN(date.getTime())) changes.taken_at = date.toISOString()
    }

    if (Object.keys(changes).length > 0) {
      const { error } = await db.from('media').update(changes).eq('id', id)
      if (error) return fail(`Could not save that: ${error.message}`, 500)
    }

    // People are replaced wholesale — the editor always sends the full list.
    if (Array.isArray(body.people)) {
      const names = [...new Set(body.people.map((n) => n.trim()).filter(Boolean))].slice(0, 30)

      const personIds: string[] = []
      for (const name of names) {
        // `limit(1)` rather than maybeSingle(): the unique index on name is
        // case-sensitive, so "Bob" and "bob" can both exist and maybeSingle
        // would throw rather than pick one.
        const { data: matches } = await db
          .from('people')
          .select('id')
          .ilike('name', name)
          .limit(1)

        const existing = matches?.[0]
        if (existing) {
          personIds.push(existing.id)
          continue
        }
        const { data: created } = await db
          .from('people')
          .insert({ name })
          .select('id')
          .single()
        if (created) personIds.push(created.id)
      }

      const { error: untagError } = await db
        .from('media_people')
        .delete()
        .eq('media_id', id)
      if (untagError) return fail(`Could not update the tags: ${untagError.message}`, 500)

      if (personIds.length) {
        const { error: tagError } = await db
          .from('media_people')
          .insert(personIds.map((person_id) => ({ media_id: id, person_id })))
        if (tagError) return fail(`Could not update the tags: ${tagError.message}`, 500)
      }
    }

    const media = await getMediaById(db, id)
    return ok({ media })
  } catch (error) {
    return handleError(error)
  }
}

/** Removes the row, and the video behind it. R2 objects are left in place. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { id } = await params
    const db = await createClient()

    const { data: media } = await db
      .from('media')
      .select('id, uploader_id, stream_uid')
      .eq('id', id)
      .maybeSingle()

    if (!media) return fail('That memory is not here.', 404)
    if (media.uploader_id !== session.userId && session.profile.role !== 'owner') {
      return fail('Only the person who added this — or the owner — can remove it.', 403)
    }

    // RLS enforces this too; the check above is so the message is a sentence.
    const { error } = await db.from('media').delete().eq('id', id)
    if (error) return fail(`Could not remove that: ${error.message}`, 500)

    if (media.stream_uid) {
      // Best effort — a stranded Stream video costs pennies; a failed delete
      // that blocks the user costs more.
      try {
        await deleteVideo(media.stream_uid)
      } catch (error) {
        console.error('[reel] could not delete Stream video', media.stream_uid, error)
      }
    }

    // Any event using it as a cover needs to forget it.
    const admin = createAdminClient()
    await admin.from('events').update({ cover_media_id: null }).eq('cover_media_id', id)

    return ok({ deleted: true })
  } catch (error) {
    return handleError(error)
  }
}
