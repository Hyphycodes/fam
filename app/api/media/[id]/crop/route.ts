import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { presignPut } from '@/lib/r2'
import type { CropMetadata } from '@/lib/types'

interface Body {
  action?: 'prepare' | 'complete'
  displayType?: string
  thumbType?: string
  width?: number
  height?: number
  crop?: unknown
}

/** Rebuilds display derivatives while keeping the original object untouched. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const body = await readJson<Body>(request)
    const { data: media } = await actor.db
      .from('media')
      .select('id, type, uploader_id, uploader_member, r2_display_key, r2_thumb_key')
      .eq('id', id)
      .maybeSingle()

    if (!media || media.type !== 'photo') return fail('That photo is not available.', 404)
    const mine = actor.memberId
      ? media.uploader_member === actor.memberId
      : media.uploader_id === actor.userId
    if (!mine && !actor.isOwner) return fail('Only the uploader or owner can change the crop.', 403)

    if (body.action === 'prepare') {
      if (!media.r2_display_key || !media.r2_thumb_key) {
        return fail('This photo does not have editable display copies.', 409)
      }
      const displayType = body.displayType === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
      const thumbType = body.thumbType === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
      const [display, thumb] = await Promise.all([
        presignPut(media.r2_display_key, displayType),
        presignPut(media.r2_thumb_key, thumbType),
      ])
      return ok({ put: { display, thumb } })
    }

    if (body.action === 'complete') {
      const width = Number(body.width)
      const height = Number(body.height)
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        return fail('The crop dimensions are not valid.')
      }
      const crop = sanitizeCrop(body.crop)
      if (!crop) return fail('The crop settings are not valid.')
      const { error } = await actor.db
        .from('media')
        .update({
          width: Math.round(width),
          height: Math.round(height),
          crop_metadata: crop,
        })
        .eq('id', id)
      if (error) return fail(`Could not save the crop: ${error.message}`, 500)
      return ok({ saved: true })
    }

    return fail('Choose a crop action.')
  } catch (error) {
    return handleError(error, 'media/crop')
  }
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
