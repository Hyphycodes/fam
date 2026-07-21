import { fail, handleError, ok } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVideo } from '@/lib/stream'

/**
 * "Is it ready yet?"
 *
 * Called while a video transcodes. Asks Cloudflare, then writes the answer back
 * so the feed and every other viewer learn about it too — the poller doesn't
 * keep the knowledge to itself.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Readable by a signed-in member, or by anyone holding the upload link that
    // put the row there in the first place.
    const token = new URL(request.url).searchParams.get('token')
    const session = await getSession()
    if (!session && !token) return fail('Not signed in.', 401)

    const admin = createAdminClient()
    const { data: media } = await admin
      .from('media')
      .select('id, type, status, stream_uid, upload_link_id, error_reason, duration_seconds')
      .eq('id', id)
      .maybeSingle()

    if (!media) return fail('That memory is not here.', 404)

    if (!session && token) {
      const { data: link } = await admin
        .from('event_upload_links')
        .select('id, revoked_at, expires_at')
        .eq('token', token)
        .maybeSingle()

      const expired = link?.expires_at != null && new Date(link.expires_at) < new Date()
      // Scoped to media this link created, not merely media in the same event.
      if (!link || link.revoked_at || expired || media.upload_link_id !== link.id) {
        return fail('Not allowed.', 403)
      }
    }

    if (media.status === 'ready' || media.status === 'error') {
      return ok({ status: media.status, error: media.error_reason ?? undefined })
    }

    // Photos are marked ready by the client once its PUTs land, so there is
    // nothing to ask Cloudflare about.
    if (media.type !== 'video' || !media.stream_uid) {
      return ok({ status: media.status })
    }

    const video = await getVideo(media.stream_uid)
    if (!video) return ok({ status: 'processing', progress: 0 })

    if (video.readyToStream) {
      await admin
        .from('media')
        .update({
          status: 'ready',
          duration_seconds: video.duration,
          width: video.width,
          height: video.height,
          byte_size: video.size,
        })
        .eq('id', id)
      return ok({ status: 'ready' })
    }

    if (video.state === 'error') {
      const reason =
        video.errorReasonText ||
        video.errorReasonCode ||
        'Cloudflare could not read that video file.'
      await admin.from('media').update({ status: 'error', error_reason: reason }).eq('id', id)
      return ok({ status: 'error', error: reason })
    }

    return ok({
      status: 'processing',
      progress: video.pctComplete,
      state: video.state,
    })
  } catch (error) {
    return handleError(error)
  }
}
