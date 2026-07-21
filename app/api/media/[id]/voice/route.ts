import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { buildKey, presignGet, presignPut } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'

/**
 * Voice notes.
 *
 * Grandma taps a photo and says who everyone was. That recording outlives every
 * group chat it would otherwise have been trapped in, so it's stored like any
 * other original: straight to R2, private, signed on read.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await getSession())) return fail('Not signed in.', 401)
    const { id } = await params
    const db = await createClient()

    const { data } = await db
      .from('voice_notes')
      .select('id, r2_key, duration_seconds, user_id, created_at')
      .eq('media_id', id)
      .order('created_at')

    const rows = data ?? []
    const userIds = [...new Set(rows.map((r) => r.user_id))]
    const { data: profiles } = userIds.length
      ? await db.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [] }

    const nameById = new Map(
      (profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]),
    )

    const notes = await Promise.all(
      rows.map(async (note) => ({
        id: note.id,
        duration_seconds: note.duration_seconds,
        created_at: note.created_at,
        name: nameById.get(note.user_id) ?? 'Someone',
        url: await presignGet(note.r2_key),
      })),
    )

    return ok({ notes })
  } catch (error) {
    return handleError(error)
  }
}

/** Step one: a presigned PUT to push the recording straight to R2. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { id } = await params
    const { contentType } = await readJson<{ contentType?: string }>(request)
    const type = contentType || 'audio/webm'
    if (!type.startsWith('audio/')) return fail('That is not an audio recording.')

    const extension = type.includes('mp4') ? 'm4a' : type.includes('mpeg') ? 'mp3' : 'webm'
    const key = buildKey({
      variant: 'voice',
      mediaId: id,
      filename: `voice-${Date.now()}.${extension}`,
    })

    return ok({ key, putUrl: await presignPut(key, type) })
  } catch (error) {
    return handleError(error)
  }
}

/** Step two: the bytes are up, record it against the memory. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { id } = await params
    const { key, durationSeconds, contentType } = await readJson<{
      key?: string
      durationSeconds?: number
      contentType?: string
    }>(request)

    // The key is client-supplied, so it has to match the exact shape we mint in
    // `buildKey` for this memory — a prefix check would accept any path in the
    // bucket that happened to contain the id.
    const expected = new RegExp(
      `^voice/\\d{4}/\\d{2}/${id.replace(/[^\w-]/g, '')}-voice-\\d+\\.(webm|m4a|mp3)$`,
    )
    if (!key || !expected.test(key)) {
      return fail('That recording does not belong to this memory.')
    }

    const db = await createClient()
    const { data, error } = await db
      .from('voice_notes')
      .insert({
        media_id: id,
        user_id: session.userId,
        r2_key: key,
        duration_seconds:
          Number.isFinite(durationSeconds) && durationSeconds! > 0
            ? Math.round(durationSeconds!)
            : null,
        mime_type: contentType ?? null,
      })
      .select('id, duration_seconds, created_at')
      .single()

    if (error) return fail(`Could not save that recording: ${error.message}`, 500)

    return ok({
      note: {
        ...data,
        name: session.profile.display_name,
        url: await presignGet(key),
      },
    })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const noteId = new URL(request.url).searchParams.get('note')
    if (!noteId) return fail('Which recording?')

    const db = await createClient()
    const { error } = await db.from('voice_notes').delete().eq('id', noteId)
    if (error) return fail(`Could not remove that: ${error.message}`, 500)
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error)
  }
}
