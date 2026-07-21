'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Lightbox } from '@/components/Lightbox'
import { duration, warmDate } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/**
 * The feed.
 *
 * One wide column with room to breathe — the deliberate opposite of a photo
 * grid. Each memory gets its own moment on the way past.
 */
export function Feed({
  initial,
  initialCursor,
  query = '',
  emptyState,
}: {
  initial: MediaView[]
  initialCursor: string | null
  /** Extra query string for /api/feed, e.g. `event=<id>`. */
  query?: string
  emptyState?: React.ReactNode
}) {
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  // The server props change when the route refreshes after an upload, and the
  // pages we appended are then stale. Adjusting state during render (rather
  // than in an effect) is React's documented way to do this — it re-renders
  // immediately instead of painting the old list first.
  const [seenInitial, setSeenInitial] = useState(initial)
  if (initial !== seenInitial) {
    setSeenInitial(initial)
    setItems(initial)
    setCursor(initialCursor)
  }

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    try {
      const params = new URLSearchParams(query)
      params.set('before', cursor)
      const response = await fetch(`/api/feed?${params}`)
      if (!response.ok) return
      const data = (await response.json()) as {
        media: MediaView[]
        nextCursor: string | null
      }
      setItems((current) => {
        // Belt and braces: a row arriving twice would break React keys.
        const seen = new Set(current.map((i) => i.id))
        return [...current, ...data.media.filter((i) => !seen.has(i.id))]
      })
      setCursor(data.nextCursor)
    } finally {
      setLoading(false)
    }
  }, [cursor, loading, query])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !cursor) return
    // Start fetching a full screen early so scrolling never hits a wall.
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore()
    }, { rootMargin: '1200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, loadMore])

  if (items.length === 0) return <>{emptyState}</>

  return (
    <>
      <div className="space-y-16 sm:space-y-24">
        {items.map((media, index) => (
          <MemoryCard
            key={media.id}
            media={media}
            priority={index < 2}
            onOpen={() => setOpen(index)}
          />
        ))}
      </div>

      <div ref={sentinel} className="h-px" />

      {loading && (
        <div className="mt-16 space-y-4">
          <div className="h-72 w-full animate-sweep rounded-2xl" />
        </div>
      )}

      {!cursor && items.length > 8 && (
        <p className="mt-24 text-center font-display text-xl text-paper-faint">
          That&rsquo;s everything, all the way back.
        </p>
      )}

      {open !== null && (
        <Lightbox
          items={items}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
        />
      )}
    </>
  )
}

function MemoryCard({
  media,
  priority,
  onOpen,
}: {
  media: MediaView
  priority: boolean
  onOpen: () => void
}) {
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3

  return (
    <article className="animate-rise">
      <button
        onClick={onOpen}
        className="group relative block w-full overflow-hidden rounded-2xl bg-ink-raised"
        style={{ aspectRatio: `${Math.min(Math.max(ratio, 0.6), 2.2)}` }}
      >
        {media.thumb_url || media.display_url ? (
          <img
            src={media.display_url ?? media.thumb_url ?? ''}
            alt={media.caption ?? ''}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
          />
        ) : (
          <div className="h-full w-full animate-sweep" />
        )}

        {media.type === 'video' && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-ink/50 via-transparent to-transparent" />
            <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1.5 text-xs text-paper backdrop-blur">
              <span className="text-[10px]">▶</span>
              {duration(media.duration_seconds) || 'Video'}
            </span>
          </>
        )}
      </button>

      <div className="mt-4 flex items-baseline justify-between gap-4 px-1">
        <div className="min-w-0">
          {media.caption && (
            <p className="mb-1 font-display text-2xl leading-snug text-paper text-balance">
              {media.caption}
            </p>
          )}
          <p className="text-sm text-paper-dim">
            {media.uploader_name}
            <span className="mx-2 text-paper-faint">·</span>
            {warmDate(media.taken_at)}
            {media.event_name && (
              <>
                <span className="mx-2 text-paper-faint">·</span>
                {media.event_name}
              </>
            )}
          </p>
        </div>

        <Counts media={media} />
      </div>
    </article>
  )
}

function Counts({ media }: { media: MediaView }) {
  const bits = [
    media.reaction_count > 0 && `${media.reaction_count}`,
    media.comment_count > 0 && `${media.comment_count} note${media.comment_count === 1 ? '' : 's'}`,
    media.voice_note_count > 0 && `${media.voice_note_count} voice`,
  ].filter(Boolean)

  if (bits.length === 0) return null
  return <p className="shrink-0 text-sm whitespace-nowrap text-paper-faint">{bits.join(' · ')}</p>
}
