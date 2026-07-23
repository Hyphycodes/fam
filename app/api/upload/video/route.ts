import { fail, handleError, isUploader, logDbError, ok, readJson, resolveUploader } from '@/lib/api'
import { createDirectUpload, deleteVideo } from '@/lib/stream'
import { isCapturePrecision, isCaptureSource } from '@/lib/format'

interface Body {
  filename?: string
  size?: number
  contentType?: string | null
  takenAt?: string
  takenSource?: string
  takenPrecision?: string
  eventId?: string | null
  linkToken?: string | null
  uploaderLabel?: string | null
  contentHash?: string | null
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

    const contentHash = normalizeHash(body.contentHash)
    if (contentHash) {
      const { data: existing } = await uploader.db
        .from('media')
        .select('id, status, uploader_id, uploader_member, upload_link_id, stream_uid')
        .eq('content_hash', contentHash)
        .maybeSingle()
      if (existing) {
        const mine =
          uploader.kind === 'link'
            ? existing.upload_link_id === uploader.linkId
            : uploader.uploaderMember
              ? existing.uploader_member === uploader.uploaderMember
              : existing.uploader_id === uploader.uploaderId

        if (existing.status !== 'error' || !mine) {
          return ok({ mediaId: existing.id, duplicate: true })
        }

        // A Stream encode failure cannot be resumed against the completed tus
        // resource. Remove this uploader's failed row and create a fresh direct
        // upload while keeping ready or someone else's media untouched.
        const { error: removeError } = await uploader.db
          .from('media')
          .delete()
          .eq('id', existing.id)
        if (removeError) {
          return fail(`Could not restart that video: ${removeError.message}`, 500)
        }
        if (existing.stream_uid) {
          try {
            await deleteVideo(existing.stream_uid)
          } catch (cleanupError) {
            console.error(
              '[reel:upload/video] could not remove failed Stream upload',
              existing.stream_uid,
              cleanupError,
            )
          }
        }
      }
    }

    const filename = (body.filename ?? 'video').slice(0, 200)
    const { uploadUrl, uid } = await createDirectUpload({
      uploadLength: size,
      name: filename,
    })

    const takenAt = parseDate(body.takenAt) ?? new Date()
    const takenSource = isCaptureSource(body.takenSource) ? body.takenSource : 'upload_fallback'
    const takenPrecision = isCapturePrecision(body.takenPrecision) ? body.takenPrecision : 'day'

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
        content_hash: contentHash,
        taken_at: takenAt.toISOString(),
        taken_source: takenSource,
        taken_precision: takenPrecision,
        event_id: uploader.eventId,
        status: 'processing',
      })
      .select('id')
      .single()

    if (error) {
      logDbError('upload/video', error, { streamUid: uid })
      try {
        await deleteVideo(uid)
      } catch (cleanupError) {
        console.error('[reel:upload/video] could not remove unused Stream upload', uid, cleanupError)
      }
      if (contentHash && error.code === '23505') {
        const { data: duplicate } = await uploader.db
          .from('media')
          .select('id')
          .eq('content_hash', contentHash)
          .maybeSingle()
        if (duplicate) return ok({ mediaId: duplicate.id, duplicate: true })
      }
      return fail(`Could not start that upload: ${error.message}`, 500)
    }

    return ok({ mediaId: data.id, uploadUrl })
  } catch (error) {
    return handleError(error, 'upload/video')
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

function normalizeHash(value: string | null | undefined): string | null {
  const hash = value?.trim().toLowerCase()
  return hash && /^[a-f0-9]{64}$/.test(hash) ? hash : null
}
