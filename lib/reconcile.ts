import 'server-only'

import { isConfigured } from '@/lib/env'
import { getVideo } from '@/lib/stream'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Reconciles "processing" videos with Cloudflare.
 *
 * The browser polls while the uploader keeps the tab open — but people close
 * tabs. Cloudflare finishes transcoding two minutes later and nobody is
 * listening, so the row stays `processing` forever, the feed hides it, and the
 * memory page says "still coming through" until the end of time.
 *
 * This runs on every page that reads media. The common case — no processing
 * rows — is one indexed query (media_status_idx is partial on status <>
 * 'ready'), so it costs nothing when there's nothing to do.
 */
export async function reconcileProcessingVideos(): Promise<boolean> {
  if (!isConfigured('stream') || !isConfigured('supabase')) return false

  const admin = createAdminClient()

  const { data } = await admin
    .from('media')
    .select('id, stream_uid, created_at')
    .eq('status', 'processing')
    .eq('type', 'video')
    .not('stream_uid', 'is', null)
    .order('created_at', { ascending: false })
    .limit(12)

  const rows = (data ?? []) as { id: string; stream_uid: string; created_at: string }[]
  if (rows.length === 0) return false

  let changed = false

  await Promise.allSettled(
    rows.map(async (row) => {
      const video = await getVideo(row.stream_uid)

      if (!video) {
        // Stream has never heard of it and it's old enough that the upload
        // clearly never completed — mark it so it stops looking alive.
        const ageMs = Date.now() - new Date(row.created_at).getTime()
        if (ageMs > 24 * 60 * 60 * 1000) {
          await admin
            .from('media')
            .update({ status: 'error', error_reason: 'The upload never finished.' })
            .eq('id', row.id)
            .eq('status', 'processing')
          changed = true
        }
        return
      }

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
          .eq('id', row.id)
          .eq('status', 'processing')
        changed = true
        return
      }

      if (video.state === 'error') {
        await admin
          .from('media')
          .update({
            status: 'error',
            error_reason:
              video.errorReasonText ||
              video.errorReasonCode ||
              'Cloudflare could not read that video file.',
          })
          .eq('id', row.id)
          .eq('status', 'processing')
        changed = true
      }
    }),
  )

  return changed
}
