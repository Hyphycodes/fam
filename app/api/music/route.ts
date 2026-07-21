import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getViewer } from '@/lib/viewer'
import { buildKey, presignGet, presignPut, sanitizeFilename } from '@/lib/r2'
import { readDb } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

/** The music bed under Movie Mode. Whatever the family wants playing. */

export async function GET() {
  try {
    if (!(await getViewer())) return fail('Not signed in.', 401)
    const db = readDb()

    const { data } = await db
      .from('music_tracks')
      .select('*')
      .order('sort_order')
      .order('created_at')

    const tracks = await Promise.all(
      (data ?? []).map(async (track: { id: string; title: string; r2_key: string }) => ({
        id: track.id,
        title: track.title,
        // Long-lived: Movie Mode can run for hours at a cookout, and a track
        // that 403s halfway through dinner is the worst possible failure.
        url: await presignGet(track.r2_key, { expiresIn: 60 * 60 * 12 }),
      })),
    )

    return ok({ tracks })
  } catch (error) {
    return handleError(error, 'music')
  }
}

/** Step one: presign. */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { filename, contentType } = await readJson<{
      filename?: string
      contentType?: string
    }>(request)

    const type = contentType || 'audio/mpeg'
    if (!type.startsWith('audio/')) return fail('That is not an audio file.')

    const key = buildKey({
      variant: 'music',
      mediaId: 'track',
      filename: sanitizeFilename(filename ?? 'track.mp3'),
    })

    return ok({ key, putUrl: await presignPut(key, type) })
  } catch (error) {
    return handleError(error, 'music')
  }
}

/** Step two: the file is up, add it to the list. */
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const { key, title } = await readJson<{ key?: string; title?: string }>(request)
    if (!key || !key.startsWith('music/')) return fail('That is not a music file we made room for.')

    const db = await createClient()
    const { data, error } = await db
      .from('music_tracks')
      .insert({
        title: (title ?? '').trim().slice(0, 200) || 'Untitled',
        r2_key: key,
        uploaded_by: session.userId,
      })
      .select('*')
      .single()

    if (error) return fail(`Could not add that track: ${error.message}`, 500)
    return ok({ track: data })
  } catch (error) {
    return handleError(error, 'music')
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session) return fail('Not signed in.', 401)

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return fail('Which track?')

    const db = await createClient()
    await db.from('music_tracks').delete().eq('id', id)
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error, 'music')
  }
}
