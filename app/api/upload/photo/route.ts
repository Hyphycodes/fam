import { randomUUID } from 'node:crypto'
import { fail, handleError, isUploader, logDbError, ok, readJson, resolveUploader } from '@/lib/api'
import { buildKey, presignPut } from '@/lib/r2'
import { isConfigured, missing } from '@/lib/env'
import { isCapturePrecision, isCaptureSource } from '@/lib/format'
import type { CropMetadata } from '@/lib/types'

interface Body {
  filename?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  takenAt?: string
  takenSource?: string
  takenPrecision?: string
  focalX?: number
  focalY?: number
  focalSource?: string
  displayType?: string
  thumbType?: string
  eventId?: string | null
  linkToken?: string | null
  uploaderLabel?: string | null
  contentHash?: string | null
  cropMetadata?: unknown
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
    // Provenance rides along with the date: a real EXIF instant is 'exif'/'exact',
    // anything else the copy-date fallback. Never trust the label past the enum.
    const takenSource = isCaptureSource(body.takenSource) ? body.takenSource : 'upload_fallback'
    const takenPrecision = isCapturePrecision(body.takenPrecision) ? body.takenPrecision : 'day'
    // Face-detected focal point from ingest. Ingest never claims a 'user'
    // placement — that's reserved for a deliberate correction and is sacred.
    const focal = sanitizeFocal(body.focalX, body.focalY, body.focalSource)
    const originalType = body.contentType || 'application/octet-stream'
    const displayType = body.displayType || 'image/jpeg'
    const thumbType = body.thumbType || 'image/jpeg'
    const contentHash = normalizeHash(body.contentHash)
    const cropMetadata = sanitizeCrop(body.cropMetadata)

    if (contentHash) {
      const { data: existing } = await uploader.db
        .from('media')
        .select('id, status, uploader_id, uploader_member, upload_link_id, r2_key, r2_display_key, r2_thumb_key')
        .eq('content_hash', contentHash)
        .maybeSingle()

      if (existing) {
        const mine =
          uploader.kind === 'link'
            ? existing.upload_link_id === uploader.linkId
            : uploader.uploaderMember
              ? existing.uploader_member === uploader.uploaderMember
              : existing.uploader_id === uploader.uploaderId

        if (
          existing.status === 'ready' ||
          !mine ||
          !existing.r2_key ||
          !existing.r2_display_key ||
          !existing.r2_thumb_key
        ) {
          return ok({ mediaId: existing.id, duplicate: true })
        }

        await uploader.db
          .from('media')
          .update({
            status: 'processing',
            error_reason: null,
            width: toInt(body.width),
            height: toInt(body.height),
            focal_x: focal.x,
            focal_y: focal.y,
            focal_source: focal.source,
            crop_metadata: cropMetadata,
          })
          .eq('id', existing.id)

        const [original, display, thumb] = await Promise.all([
          presignPut(existing.r2_key, originalType),
          presignPut(existing.r2_display_key, displayType),
          presignPut(existing.r2_thumb_key, thumbType),
        ])
        return ok({ mediaId: existing.id, put: { original, display, thumb }, resumed: true })
      }
    }

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
      content_hash: contentHash,
      crop_metadata: cropMetadata,
      taken_at: takenAt.toISOString(),
      taken_source: takenSource,
      taken_precision: takenPrecision,
      focal_x: focal.x,
      focal_y: focal.y,
      focal_source: focal.source,
      event_id: uploader.eventId,
      r2_key: keys.original,
      r2_display_key: keys.display,
      r2_thumb_key: keys.thumb,
      status: 'processing',
    })

    if (error) {
      if (contentHash && error.code === '23505') {
        const { data: duplicate } = await uploader.db
          .from('media')
          .select('id')
          .eq('content_hash', contentHash)
          .maybeSingle()
        if (duplicate) return ok({ mediaId: duplicate.id, duplicate: true })
      }
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

/** A focal point is only trusted inside [0,1]; ingest may report 'face' or
 *  'default' but never 'user' (that's a person's deliberate placement). */
function sanitizeFocal(
  x: unknown,
  y: unknown,
  source: unknown,
): { x: number; y: number; source: 'default' | 'face' } {
  const coord = (value: unknown) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null
  }
  const fx = coord(x)
  const fy = coord(y)
  const faced = source === 'face' && fx !== null && fy !== null
  return faced ? { x: fx as number, y: fy as number, source: 'face' } : { x: 0.5, y: 0.5, source: 'default' }
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

function normalizeHash(value: string | null | undefined): string | null {
  const hash = value?.trim().toLowerCase()
  return hash && /^[a-f0-9]{64}$/.test(hash) ? hash : null
}

function sanitizeCrop(value: unknown): CropMetadata | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const aspects = ['free', 'original', '1:1', '4:3', '3:2', '16:9', '9:16'] as const
  const aspect = aspects.find((entry) => entry === input.aspect)
  const zoom = Number(input.zoom)
  const x = Number(input.x)
  const y = Number(input.y)
  const rotation = Number(input.rotation)
  const freeAspect = input.freeAspect == null ? undefined : Number(input.freeAspect)
  if (
    !aspect ||
    !Number.isFinite(zoom) || zoom < 1 || zoom > 3 ||
    !Number.isFinite(x) || x < -1 || x > 1 ||
    !Number.isFinite(y) || y < -1 || y > 1 ||
    ![0, 90, 180, 270].includes(rotation) ||
    (freeAspect !== undefined && (!Number.isFinite(freeAspect) || freeAspect < 0.4 || freeAspect > 2.5))
  ) return null
  return { aspect, freeAspect, zoom, x, y, rotation: rotation as CropMetadata['rotation'] }
}
