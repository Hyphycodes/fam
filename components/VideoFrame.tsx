'use client'

/**
 * Cloudflare's player, in an iframe.
 *
 * Deliberately not a bare <video> with an HLS manifest: adaptive HLS only plays
 * natively in Safari. Chrome on Android, a laptop, and most smart-TV browsers
 * would need hls.js bolted on. Cloudflare's embed already carries that, and
 * they keep it working across devices we'll never test on.
 */
export function VideoFrame({
  src,
  poster,
  autoplay = false,
  muted = false,
  controls = true,
  className = '',
  title = 'Video',
}: {
  src: string
  poster?: string | null
  autoplay?: boolean
  muted?: boolean
  controls?: boolean
  className?: string
  title?: string
}) {
  const url = new URL(src)
  // Cloudflare reads the absence of the flag as "off" — `autoplay=false` would
  // switch it *on*.
  if (autoplay) url.searchParams.set('autoplay', 'true')
  if (muted) url.searchParams.set('muted', 'true')
  if (!controls) url.searchParams.set('controls', 'false')
  if (poster) url.searchParams.set('poster', poster)

  return (
    <iframe
      src={url.toString()}
      title={title}
      loading="lazy"
      className={`h-full w-full border-0 ${className}`}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowFullScreen
    />
  )
}
