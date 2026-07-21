import { randomUUID } from 'node:crypto'
import { fail, handleError, isUploader, logDbError, ok, readJson, resolveUploader } from '@/lib/api'
import { buildKey, presignPut } from '@/lib/r2'
import { isConfigured, missing } from '@/lib/env'

interface Body {
  filename?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  takenAt?: string
  displayType?: string
  thumbType?: string
  eventId?: string | null
  linkToken?: string | null
  uploaderLabel?: string | null
}

const EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/**
 * Hands back three presigned PUTs — original, display copy, thumbnail — that
 * the phone uploads to directly. The bucket stays private; these links are the
 * only way in, and they expire.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request)

    const size = Number(body.size)
    if (!Number.isFinite(size) || size <= 0) return fail('That file looks empty.')
    if (size > 2 * 1024 ** 3) return fail('That photo is unusually large — over 2GB.')

    // Videos never touch R2 (Cloudflare Stream handles their whole upload —
    // record, playback), which is exactly why "video works, photo doesn't" is
    // the classic symptom of R2 not being configured yet. Check first and say
    // so plainly, instead of failing several steps later with no clue why.
    if (!isConfigured('r2')) {
      console.error('[reel:upload/photo] R2 is not configured — missing:', missing('r2'))
      return fail(
        'Photo storage isn’t finished being set up yet (videos use a different service, which is why they still work). Ask whoever runs the family archive to complete the Cloudflare R2 setup.',
        503,
      )
    }

    const uploader = await resolveUploader(body)
    if (!isUploader(uploader)) return fail(uploader.error, uploader.status)

    const filename = (body.filename ?? 'photo').slice(0, 200)
    const takenAt = parseDate(body.takenAt) ?? new Date()
    const originalType = body.contentType || 'application/octet-stream'
    const displayType = body.displayType || 'image/jpeg'
    const thumbType = body.thumbType || 'image/jpeg'

    // The id is minted here rather than by the database so the storage keys can
    // be written in the same insert. That lets the schema treat those columns as
    // write-once — nobody can later repoint a row at another object in the
    // bucket and have the app sign a URL for it.
    const mediaId = randomUUID()
    const stem = filename.replace(/\.[^.]+$/, '')
    const keys = {
      original: buildKey({ variant: 'original', mediaId, filename, takenAt }),
      display: buildKey({
        variant: 'display',
        mediaId,
        filename: `${stem}.${EXTENSION[displayType] ?? 'jpg'}`,
        takenAt,
      }),
      thumb: buildKey({
        variant: 'thumb',
        mediaId,
        filename: `${stem}.${EXTENSION[thumbType] ?? 'jpg'}`,
        takenAt,
      }),
    }

    const { error } = await uploader.db.from('media').insert({
      id: mediaId,
      uploader_id: uploader.uploaderId,
      uploader_member: uploader.uploaderMember,
      uploader_label: uploader.label,
      upload_link_id: uploader.linkId,
      type: 'photo',
      mime_type: originalType,
      original_filename: filename,
      byte_size: size,
      width: toInt(body.width),
      height: toInt(body.height),
      taken_at: takenAt.toISOString(),
      event_id: uploader.eventId,
      r2_key: keys.original,
      r2_display_key: keys.display,
      r2_thumb_key: keys.thumb,
      status: 'processing',
    })

    if (error) {
      logDbError('upload/photo', error, { mediaId })
      return fail(`Could not start that upload: ${error.message}`, 500)
    }

    // Presigning is pure local HMAC — it should never fail once the row above
    // succeeded. If it does (a bad key format, a missing R2 credential that
    // slipped past env validation), that's worth its own log line rather than
    // falling into the generic catch-all below with no clue which step broke.
    let put: { original: string; display: string; thumb: string }
    try {
      const [signedOriginal, signedDisplay, signedThumb] = await Promise.all([
        presignPut(keys.original, originalType),
        presignPut(keys.display, displayType),
        presignPut(keys.thumb, thumbType),
      ])
      put = { original: signedOriginal, display: signedDisplay, thumb: signedThumb }
    } catch (presignError) {
      console.error('[reel:upload/photo] could not presign R2 keys', {
        mediaId,
        keys,
        name: presignError instanceof Error ? presignError.name : undefined,
        message: presignError instanceof Error ? presignError.message : String(presignError),
        stack: presignError instanceof Error ? presignError.stack : undefined,
      })
      return fail(
        'Could not prepare that upload for storage. Try again in a moment — if it keeps happening, check /api/debug/r2 for a live storage check.',
        500,
      )
    }

    return ok({ mediaId, put })
  } catch (error) {
    return handleError(error, 'upload/photo')
  }
}

function toInt(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const now = Date.now()
  if (date.getTime() > now + 86_400_000) return null
  if (date.getTime() < Date.UTC(1900, 0, 1)) return null
  return date
}
