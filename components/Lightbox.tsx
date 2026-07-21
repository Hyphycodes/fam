'use client'

import { useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { VideoFrame } from '@/components/VideoFrame'
import { DownloadButton } from '@/components/DownloadButton'
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
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number | null>(null)

  const go = useCallback(
    (delta: number) => {
      const next = index + delta
      if (next >= 0 && next < items.length) onIndexChange(next)
    },
    [index, items.length, onIndexChange],
  )

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Stop the page behind from scrolling under the overlay, move focus into
    // the dialog, and return it to the memory card when the viewer closes.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)

      if (event.key === 'Tab' && dialog.current) {
        const focusable = Array.from(
          dialog.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (!media) return null

  return (
    <div
      ref={dialog}
      className="fixed inset-0 z-[100] flex flex-col bg-ink/97 backdrop-blur-sm animate-fade"
      role="dialog"
      aria-modal="true"
      aria-label={media.caption || 'Memory'}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current
        if (startX === null) return
        const endX = event.changedTouches[0]?.clientX
        touchStartX.current = null
        if (endX === undefined) return
        const distance = endX - startX
        if (Math.abs(distance) < 56) return
        go(distance < 0 ? 1 : -1)
      }}
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
            <DownloadButton
              url={media.download_url}
              filename={media.download_filename}
              mimeType={media.mime_type}
              byteSize={media.byte_size}
              className="rounded-full border border-edge-strong px-4 py-2 text-xs text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper"
            >
              Download
            </DownloadButton>
          )}
          <button
            ref={closeButton}
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
            width={media.width ?? undefined}
            height={media.height ?? undefined}
            alt={
              media.caption ||
              `${media.type === 'video' ? 'Video' : 'Photo'} shared by ${media.uploader_name}`
            }
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
