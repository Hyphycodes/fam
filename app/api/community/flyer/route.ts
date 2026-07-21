import { randomUUID } from 'node:crypto'
import { fail, handleError, ok } from '@/lib/api'
import { getMember } from '@/lib/member'
import { createAdminClient } from '@/lib/supabase/admin'
import { FLYER_BUCKET, flyerUrl } from '@/lib/community/avatars'

const MAX_BYTES = 4 * 1024 * 1024
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Uploads an event flyer, returning the stored path to attach on create. */
export async function POST(request: Request) {
  try {
    const member = await getMember()
    if (!member) return fail('Sign in first.', 401)

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return fail('No image came through.')
    if (file.size > MAX_BYTES) return fail('That image is too big — try a smaller one.')
    const ext = TYPES[file.type]
    if (!ext) return fail('Use a JPEG, PNG or WebP.')

    const admin = createAdminClient()
    const path = `${member.id}/${randomUUID()}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error } = await admin.storage
      .from(FLYER_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true })
    if (error) return fail(`Could not upload that flyer: ${error.message}`, 500)

    return ok({ flyer_path: path, flyer_url: flyerUrl(path) })
  } catch (error) {
    return handleError(error)
  }
}
