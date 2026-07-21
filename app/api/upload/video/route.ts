import { fail, handleError, isUploader, ok, readJson, resolveUploader } from '@/lib/api'
import { createDirectUpload } from '@/lib/stream'

interface Body {
  filename?: string
  size?: number
  contentType?: string | null
  takenAt?: string
  eventId?: string | null
  linkToken?: string | null
  uploaderLabel?: string | null
}

/**
 * Mints a one-time Cloudflare Stream upload URL.
 *
 * The video itself never comes through here — only the ~200 bytes needed to
 * authorise it. That is the whole point: a serverless function would time out
 * long before a 3GB clip finished.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request)

    const size = Number(body.size)
    if (!Number.isFinite(size) || size <= 0) {
      return fail('That file looks empty.')
    }
    // Cloudflare's own ceiling is 30GB; refuse earlier with a human sentence.
    if (size > 30 * 1024 ** 3) {
      return fail('That video is bigger than 30GB — Cloudflare will not take it.')
    }

    const uploader = await resolveUploader(body)
    if (!isUploader(uploader)) return fail(uploader.error, uploader.status)

    const filename = (body.filename ?? 'video').slice(0, 200)
    const { uploadUrl, uid } = await createDirectUpload({
      uploadLength: size,
      name: filename,
    })

    const takenAt = parseDate(body.takenAt) ?? new Date()

    const { data, error } = await uploader.db
      .from('media')
      .insert({
        uploader_id: uploader.uploaderId,
        uploader_member: uploader.uploaderMember,
        uploader_label: uploader.label,
        upload_link_id: uploader.linkId,
        type: 'video',
        stream_uid: uid,
        mime_type: body.contentType ?? null,
        original_filename: filename,
        byte_size: size,
        taken_at: takenAt.toISOString(),
        event_id: uploader.eventId,
        status: 'processing',
      })
      .select('id')
      .single()

    if (error) return fail(`Could not start that upload: ${error.message}`, 500)

    return ok({ mediaId: data.id, uploadUrl })
  } catch (error) {
    return handleError(error)
  }
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // A phone with a wrong clock shouldn't file a memory in 2041.
  const now = Date.now()
  if (date.getTime() > now + 86_400_000) return null
  if (date.getTime() < Date.UTC(1900, 0, 1)) return null
  return date
}
