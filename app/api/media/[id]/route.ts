import { fail, handleError, ok, readJson } from '@/lib/api'
import { isCapturePrecision } from '@/lib/format'
import { getActor } from '@/lib/community/actor'
import { getMediaById } from '@/lib/queries'
import { readDb } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteVideo } from '@/lib/stream'
import { deleteObjects } from '@/lib/r2'
import { isConfigured } from '@/lib/env'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getActor())) return fail('Not signed in.', 401)
    const { id } = await params
    const media = await getMediaById(readDb(), id)
    if (!media) return fail('That item is not available.', 404)
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
  takenPrecision?: string
  location?: string | null
  people?: (string | { name?: string; memberId?: string | null; profileId?: string | null })[]
}

/** Caption it, star it, file it under an event, say who's in it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if ('location' in body)
      changes.location_text = (body.location ?? '').trim().slice(0, 200) || null
    if (body.takenAt) {
      const date = new Date(body.takenAt)
      if (!Number.isNaN(date.getTime())) {
        changes.taken_at = date.toISOString()
        // A person set this date by hand. Mark it sacred: no automated job
        // (backfill, EXIF-on-upload, future inherit) may ever overwrite a
        // 'user' source.
        changes.taken_source = 'user'
      }
    }
    if (isCapturePrecision(body.takenPrecision)) changes.taken_precision = body.takenPrecision

    if (Object.keys(changes).length > 0) {
      const { error } = await db.from('media').update(changes).eq('id', id)
      if (error) return fail(`Could not save that: ${error.message}`, 500)
    }

    // People are replaced wholesale — the editor always sends the full list.
    if (Array.isArray(body.people)) {
      const requested = [
        ...new Map(
          body.people
            .map((person) =>
              typeof person === 'string'
                ? { name: person.trim(), memberId: null, profileId: null }
                : {
                    name: (person.name ?? '').trim(),
                    memberId: person.memberId || null,
                    profileId: person.profileId || null,
                  },
            )
            .filter((person) => person.name)
            .map((person) => [
              person.memberId ?? person.profileId ?? person.name.toLocaleLowerCase(),
              person,
            ]),
        ).values(),
      ].slice(0, 30)

      const memberIds = requested.flatMap((person) => (person.memberId ? [person.memberId] : []))
      const profileIds = requested.flatMap((person) => (person.profileId ? [person.profileId] : []))
      const [{ data: members }, { data: profiles }] = await Promise.all([
        memberIds.length
          ? db.from('members').select('id, display_name').in('id', memberIds)
          : Promise.resolve({ data: [] }),
        profileIds.length
          ? db.from('profiles').select('id, display_name').in('id', profileIds)
          : Promise.resolve({ data: [] }),
      ])
      const memberName = new Map(
        ((members ?? []) as { id: string; display_name: string }[]).map((member) => [
          member.id,
          member.display_name,
        ]),
      )
      const profileName = new Map(
        ((profiles ?? []) as { id: string; display_name: string }[]).map((profile) => [
          profile.id,
          profile.display_name,
        ]),
      )

      const personIds: string[] = []
      for (const requestedPerson of requested) {
        const memberId =
          requestedPerson.memberId && memberName.has(requestedPerson.memberId)
            ? requestedPerson.memberId
            : null
        const profileId =
          requestedPerson.profileId && profileName.has(requestedPerson.profileId)
            ? requestedPerson.profileId
            : null
        const name =
          (memberId ? memberName.get(memberId) : null) ??
          (profileId ? profileName.get(profileId) : null) ??
          requestedPerson.name

        let matches: { id: string; member_id: string | null; profile_id: string | null }[] | null =
          null
        if (memberId) {
          const result = await db
            .from('people')
            .select('id, member_id, profile_id')
            .eq('member_id', memberId)
            .limit(1)
          matches = result.data
        } else if (profileId) {
          const result = await db
            .from('people')
            .select('id, member_id, profile_id')
            .eq('profile_id', profileId)
            .limit(1)
          matches = result.data
        }
        if (!matches?.length) {
          const result = await db
            .from('people')
            .select('id, member_id, profile_id')
            .ilike('name', name)
            .limit(10)
          const compatible = result.data?.find(
            (person) =>
              (!memberId || !person.member_id || person.member_id === memberId) &&
              (!profileId || !person.profile_id || person.profile_id === profileId),
          )
          matches = compatible ? [compatible] : []
        }

        let personId = matches?.[0]?.id
        if (!personId) {
          const { data: created, error: createError } = await db
            .from('people')
            .insert({ name, member_id: memberId, profile_id: profileId })
            .select('id')
            .single()
          if (createError) {
            return fail(`Could not add ${name}: ${createError.message}`, 500)
          }
          personId = created?.id
        }
        if (!personId) continue

        const identityChanges: Record<string, string> = {}
        if (memberId && !matches?.[0]?.member_id) identityChanges.member_id = memberId
        if (profileId && !matches?.[0]?.profile_id) identityChanges.profile_id = profileId
        if (Object.keys(identityChanges).length) {
          const { error: identityError } = await db
            .from('people')
            .update(identityChanges)
            .eq('id', personId)
          if (identityError) {
            return fail(
              `Could not link ${name} to the right profile: ${identityError.message}`,
              500,
            )
          }
        }
        if (!personIds.includes(personId)) personIds.push(personId)
      }

      const { error: untagError } = await db.from('media_people').delete().eq('media_id', id)
      if (untagError) return fail(`Could not update the tags: ${untagError.message}`, 500)

      if (personIds.length) {
        const { error: tagError } = await db
          .from('media_people')
          .insert(
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

/** Removes the row and then best-effort deletes its storage objects. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const db = actor.db

    const { data: media } = await db
      .from('media')
      .select('id, uploader_id, uploader_member, stream_uid, r2_key, r2_display_key, r2_thumb_key')
      .eq('id', id)
      .maybeSingle()

    if (!media) return fail('That item is not available.', 404)
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

    if (isConfigured('r2')) {
      try {
        await deleteObjects([media.r2_key, media.r2_display_key, media.r2_thumb_key])
      } catch (storageError) {
        console.error('[reel] could not delete R2 media objects', id, storageError)
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
