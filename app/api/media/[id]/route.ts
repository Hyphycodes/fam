import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { getMediaById } from '@/lib/queries'
import { readDb } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteVideo } from '@/lib/stream'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await getActor())) return fail('Not signed in.', 401)
    const { id } = await params
    const media = await getMediaById(readDb(), id)
    if (!media) return fail('That memory is not here.', 404)
    return ok({ media })
  } catch (error) {
    return handleError(error, 'media')
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
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const body = await readJson<Patch>(request)
    const db = actor.db

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
        const { data: matches } = await db.from('people').select('id, member_id').ilike('name', name).limit(1)

        let personId = matches?.[0]?.id
        let linkedMember = matches?.[0]?.member_id ?? null

        if (!personId) {
          const { data: created } = await db.from('people').insert({ name }).select('id').single()
          personId = created?.id
        }
        if (!personId) continue

        // If this name is a member's, link the person row so the tag carries
        // that member's avatar and their "By person" page merges cleanly.
        if (!linkedMember) {
          const { data: member } = await db
            .from('members')
            .select('id')
            .ilike('display_name', name)
            .limit(1)
          if (member?.[0]) {
            await db.from('people').update({ member_id: member[0].id }).eq('id', personId)
            linkedMember = member[0].id
          }
        }
        personIds.push(personId)
      }

      const { error: untagError } = await db.from('media_people').delete().eq('media_id', id)
      if (untagError) return fail(`Could not update the tags: ${untagError.message}`, 500)

      if (personIds.length) {
        const { error: tagError } = await db.from('media_people').insert(
          personIds.map((person_id) => ({ media_id: id, person_id, tagged_by: actor.memberId })),
        )
        if (tagError) return fail(`Could not update the tags: ${tagError.message}`, 500)
      }
    }

    const media = await getMediaById(db, id)
    return ok({ media })
  } catch (error) {
    return handleError(error, 'media')
  }
}

/** Removes the row, and the video behind it. R2 objects are left in place. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const db = actor.db

    const { data: media } = await db
      .from('media')
      .select('id, uploader_id, uploader_member, stream_uid')
      .eq('id', id)
      .maybeSingle()

    if (!media) return fail('That memory is not here.', 404)
    const mine = actor.memberId
      ? media.uploader_member === actor.memberId
      : media.uploader_id === actor.userId
    if (!mine && !actor.isOwner) {
      return fail('Only the person who added this — or the owner — can remove it.', 403)
    }

    const { error } = await db.from('media').delete().eq('id', id)
    if (error) return fail(`Could not remove that: ${error.message}`, 500)

    if (media.stream_uid) {
      // Best effort — a stranded Stream video costs pennies; a failed delete
      // that blocks the user costs more.
      try {
        await deleteVideo(media.stream_uid)
      } catch (streamError) {
        console.error('[reel] could not delete Stream video', media.stream_uid, streamError)
      }
    }

    // Any event using it as a cover needs to forget it.
    const admin = createAdminClient()
    await admin.from('events').update({ cover_media_id: null }).eq('cover_media_id', id)

    return ok({ deleted: true })
  } catch (error) {
    return handleError(error, 'media')
  }
}
