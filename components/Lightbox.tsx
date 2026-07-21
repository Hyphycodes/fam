'use client'

import { useCallback, useEffect } from 'react'
import Link from 'next/link'
import { VideoFrame } from '@/components/VideoFrame'
import { fullDate } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/** Full-bleed viewing. Arrow keys and swipe move through the set. */
export function Lightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: MediaView[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
}) {
  const media = items[index]

  const go = useCallback(
    (delta: number) => {
      const next = index + delta
      if (next >= 0 && next < items.length) onIndexChange(next)
    },
    [index, items.length, onIndexChange],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    // Stop the page behind from scrolling under the overlay.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [go, onClose])

  if (!media) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-ink/97 backdrop-blur-sm animate-fade"
      role="dialog"
      aria-modal="true"
      aria-label={media.caption ?? 'Memory'}
    >
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="truncate text-sm text-paper-soft">{media.uploader_name}</p>
          <p className="text-xs text-paper-dim">{fullDate(media.taken_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/m/${media.id}`}
            className="rounded-full border border-edge-strong px-4 py-2 text-xs text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper"
          >
            Open
          </Link>
          {media.download_url && (
            <a
              href={media.download_url}
              className="rounded-full border border-edge-strong px-4 py-2 text-xs text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper"
            >
              Download
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-edge-strong px-4 py-2 text-xs text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper"
          >
            Close
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        {index > 0 && <Arrow direction="left" onClick={() => go(-1)} />}
        {index < items.length - 1 && <Arrow direction="right" onClick={() => go(1)} />}

        {media.type === 'video' && media.iframe_url ? (
          <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-xl bg-black">
            <VideoFrame src={media.iframe_url} poster={media.display_url} autoplay />
          </div>
        ) : media.display_url ? (
          <img
            key={media.id}
            src={media.display_url}
            alt={media.caption ?? ''}
            className="max-h-full max-w-full rounded-lg object-contain animate-fade"
          />
        ) : (
          <p className="text-paper-dim">This one is still coming through.</p>
        )}
      </div>

      {media.caption && (
        <p className="px-6 pb-8 text-center font-display text-xl text-paper-soft text-balance">
          {media.caption}
        </p>
      )}
    </div>
  )
}

function Arrow({
  direction,
  onClick,
}: {
  direction: 'left' | 'right'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={direction === 'left' ? 'Previous' : 'Next'}
      className={`absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-ink-raised/70 text-paper-soft backdrop-blur transition-colors hover:bg-ink-hover hover:text-paper sm:flex ${
        direction === 'left' ? 'left-4' : 'right-4'
      }`}
    >
      {direction === 'left' ? '‹' : '›'}
    </button>
  )
}
