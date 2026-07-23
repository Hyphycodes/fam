'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Lightbox } from '@/components/Lightbox'
import { Avatar } from '@/components/Avatar'
import { PeopleStack } from '@/components/PeopleStack'
import { duration, warmCapturedAt } from '@/lib/format'
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
  featuredFirst = false,
  afterFeatured,
}: {
  initial: MediaView[]
  initialCursor: string | null
  /** Extra query string for /api/feed, e.g. `event=<id>`. */
  query?: string
  emptyState?: React.ReactNode
  featuredFirst?: boolean
  afterFeatured?: React.ReactNode
}) {
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
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

  const loadMore = useCallback(async (force = false) => {
    if (loading || !cursor || (loadError && !force)) return
    setLoading(true)
    setLoadError(false)
    try {
      const params = new URLSearchParams(query)
      params.set('before', cursor)
      const response = await fetch(`/api/feed?${params}`)
      if (!response.ok) throw new Error('feed')
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
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [cursor, loadError, loading, query])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !cursor || loadError) return
    // Start fetching a full screen early so scrolling never hits a wall.
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore()
    }, { rootMargin: '1200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, loadError, loadMore])

  if (items.length === 0) return <>{emptyState}</>

  return (
    <>
      <div className={featuredFirst ? 'editorial-feed' : 'space-y-16 sm:space-y-24'}>
        {items.map((media, index) => {
          const paced = featuredFirst && index > 0
          return (
            <div
              key={media.id}
              className={
                paced
                  ? `editorial-memory ${index % 2 === 0 ? 'editorial-memory-right' : ''}`
                  : undefined
              }
            >
              {/* A quiet numeral where one year gives way to the next —
                  scrolling the feed becomes scrolling back through time. */}
              {index > 0 && items[index - 1].taken_year !== media.taken_year && (
                <div className="mb-14 flex items-center gap-6 sm:mb-20">
                  <span className="year-ghost">{media.taken_year}</span>
                  <span className="h-px flex-1 bg-edge" />
                </div>
              )}
              <MemoryCard
                media={media}
                priority={index === 0}
                featured={featuredFirst && index === 0}
                onOpen={() => setOpen(index)}
              />
              {index === 0 && afterFeatured && (
                <div className="editorial-interlude">{afterFeatured}</div>
              )}
            </div>
          )
        })}
      </div>

      <div ref={sentinel} className="h-px" />

      {loading && (
        <div className="mt-16 space-y-4">
          <div className="h-72 w-full animate-sweep rounded-2xl" />
        </div>
      )}

      {loadError && (
        <div className="mt-12 rounded-xl border border-edge bg-ink-raised px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <p className="text-sm leading-relaxed text-paper-dim">
            The next page did not load.
          </p>
          <button
            type="button"
            onClick={() => void loadMore(true)}
            className="btn btn-ghost mt-4 shrink-0 sm:mt-0"
          >
            Try again
          </button>
        </div>
      )}

      {!cursor && items.length > 8 && (
        <p className="mt-24 text-center text-sm text-paper-faint">
          End of results
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
  featured,
  onOpen,
}: {
  media: MediaView
  priority: boolean
  featured: boolean
  onOpen: () => void
}) {
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3

  return (
    <article className={`animate-rise ${featured ? 'featured-memory' : ''}`}>
      <button
        onClick={onOpen}
        aria-label={`Open ${media.caption || `${media.type} shared by ${media.uploader_name}`}`}
        className="group relative block w-full overflow-hidden rounded-lg bg-ink-raised ring-1 ring-edge transition-shadow duration-500 ring-inset hover:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] hover:ring-edge-strong"
        style={{ aspectRatio: `${Math.min(Math.max(ratio, 0.6), 2.2)}` }}
      >
        {media.thumb_url || media.display_url ? (
          <img
            src={media.display_url ?? media.thumb_url ?? ''}
            width={media.width ?? undefined}
            height={media.height ?? undefined}
            alt={
              media.caption ||
              `${media.type === 'video' ? 'Video' : 'Photo'} shared by ${media.uploader_name}`
            }
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full animate-sweep" />
        )}

        {/* A breath of dark at the base so the badges always sit on something. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />

        {media.type === 'video' && (
          <span className="meta-mono absolute bottom-4 left-4 flex items-center gap-2 rounded-[0.3rem] bg-black/65 px-2 py-1 text-white/90 sm:bottom-5 sm:left-5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
            {duration(media.duration_seconds) || 'Video'}
          </span>
        )}

        {media.favorite && (
          <span
            className="absolute top-4 right-4 text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] sm:top-5 sm:right-5"
            title="One of the good ones"
          >
            ★
          </span>
        )}
      </button>

      <div className="mt-3.5 flex flex-col gap-2 px-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {media.caption && (
            <p className="mb-0.5 text-lg leading-snug font-medium text-paper text-balance">
              {media.caption}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm leading-relaxed text-paper-dim">
            <Avatar name={media.uploader_name} src={media.uploader_avatar_url} size={20} />
            <span className="text-paper-soft">{media.uploader_name}</span>
            <span className="text-paper-faint">·</span>
            {warmCapturedAt(media.taken_at, media.taken_precision)}
            {media.event_name && (
              <>
                <span className="text-paper-faint">·</span>
                {media.event_name}
              </>
            )}
          </p>
          {media.people.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <PeopleStack people={media.people} size={20} max={5} />
              <span className="truncate text-xs text-paper-faint">
                {media.people.map((p) => p.name).join(', ')}
              </span>
            </div>
          )}
        </div>

        <Counts media={media} />
      </div>
    </article>
  )
}

function Counts({ media }: { media: MediaView }) {
  const bits = [
    media.reaction_count > 0 &&
      `${media.reaction_count} reaction${media.reaction_count === 1 ? '' : 's'}`,
    media.comment_count > 0 &&
      `${media.comment_count} note${media.comment_count === 1 ? '' : 's'}`,
    media.voice_note_count > 0 &&
      `${media.voice_note_count} voice note${media.voice_note_count === 1 ? '' : 's'}`,
  ].filter(Boolean)

  if (bits.length === 0) return null
  return <p className="shrink-0 text-sm text-paper-faint">{bits.join(' · ')}</p>
}
