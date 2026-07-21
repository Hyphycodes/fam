import Link from 'next/link'
import { duration, warmDate } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/**
 * A horizontal run of memories. The alternative to a folder — you drift along
 * it rather than navigating it.
 */
export function Shelf({
  title,
  subtitle,
  items,
  href,
}: {
  title: string
  subtitle?: string
  items: MediaView[]
  href?: string
}) {
  if (items.length === 0) return null

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          {subtitle && (
            <p className="mb-1 text-xs tracking-[0.2em] text-paper-faint uppercase">
              {subtitle}
            </p>
          )}
          <h2 className="font-display text-title leading-none text-balance">{title}</h2>
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-sm text-paper-dim transition-colors hover:text-paper"
          >
            See all
          </Link>
        )}
      </div>

      <div className="shelf pb-2">
        {items.map((media) => (
          <Link
            key={media.id}
            href={`/m/${media.id}`}
            className="group w-56 sm:w-72"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-ink-raised">
              {media.thumb_url ? (
                <img
                  src={media.thumb_url}
                  alt={media.caption ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full animate-sweep" />
              )}

              {media.type === 'video' && (
                <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] text-paper backdrop-blur">
                  ▶ {duration(media.duration_seconds) || 'Video'}
                </span>
              )}
            </div>

            <p className="mt-3 truncate text-sm text-paper-soft">
              {media.caption || media.uploader_name}
            </p>
            <p className="text-xs text-paper-faint">{warmDate(media.taken_at)}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
