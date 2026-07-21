'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Sits on a memory page while the video is still transcoding and refreshes the
 * page the moment it's ready — whoever is looking at it, not just whoever
 * uploaded it. The status route writes the answer back to the database, so one
 * viewer's poll benefits everyone.
 */
export function ProcessingWatcher({ mediaId }: { mediaId: string }) {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    let delay = 3000

    const tick = async () => {
      if (cancelled) return
      try {
        const response = await fetch(`/api/media/${mediaId}/status`, { cache: 'no-store' })
        if (response.ok) {
          const data = (await response.json()) as { status: string }
          if (data.status !== 'processing') {
            router.refresh()
            return
          }
        }
      } catch {
        // Poor signal — keep trying; the backoff below takes care of pacing.
      }
      delay = Math.min(delay * 1.3, 12_000)
      if (!cancelled) window.setTimeout(tick, delay)
    }

    const timer = window.setTimeout(tick, delay)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mediaId, router])

  return null
}
