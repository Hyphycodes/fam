import { randomUUID } from 'node:crypto'
import { fail, handleError, ok } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { createAdminClient } from '@/lib/supabase/admin'
import { AVATAR_BUCKET, avatarUrl } from '@/lib/community/avatars'

const MAX_BYTES = 4 * 1024 * 1024 // the client downscales; this is a backstop.
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Set or replace a profile picture — any viewer, passcode member or legacy
 * email account alike.
 *
 * The browser downscales to a small square first, so this only ever handles a
 * couple hundred KB. Upload runs through the service role — neither identity
 * necessarily has a Supabase auth session of its own here — into the public
 * avatars bucket at an unguessable path.
 */
export async function POST(request: Request) {
  try {
    const viewer = await getViewer()
    if (!viewer) return fail('Sign in first.', 401)

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return fail('No image came through.')
    if (file.size > MAX_BYTES) return fail('That image is too big — try a smaller one.')

    const ext = TYPES[file.type]
    if (!ext) return fail('Use a JPEG, PNG or WebP.')

    const admin = createAdminClient()
    const path = `${viewer.id}/${randomUUID()}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true })
    if (uploadError) return fail(`Could not save that photo: ${uploadError.message}`, 500)

    const table = viewer.kind === 'member' ? 'members' : 'profiles'
    const column = viewer.kind === 'member' ? 'avatar_path' : 'avatar_url'

    // Best-effort cleanup of the previous file so the bucket doesn't accumulate.
    const { data: current } = await admin.from(table).select(column).eq('id', viewer.id).maybeSingle()
    const previousPath = (current as Record<string, string | null> | null)?.[column]
    if (previousPath && previousPath !== path && !/^https?:\/\//.test(previousPath)) {
      await admin.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => {})
    }

    const { error } = await admin.from(table).update({ [column]: path }).eq('id', viewer.id)
    if (error) return fail(`Could not save that photo: ${error.message}`, 500)

    return ok({ avatar_url: avatarUrl(path) })
  } catch (error) {
    return handleError(error, 'community/avatar')
  }
}
