import Link from 'next/link'
import { duration, osdDate } from '@/lib/format'
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
  hideHeading = false,
}: {
  title: string
  subtitle?: string
  items: MediaView[]
  href?: string
  hideHeading?: boolean
}) {
  if (items.length === 0) return null

  return (
    <div>
      {!hideHeading && (
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <div>
            {subtitle && <p className="eyebrow mb-1">{subtitle}</p>}
            <h2 className="text-lg font-medium tracking-[-0.01em] text-balance">{title}</h2>
          </div>
          {href && (
            <Link
              href={href}
              className="shrink-0 text-xs text-paper-faint transition-colors hover:text-paper"
            >
              All
            </Link>
          )}
        </div>
      )}

      <div className="shelf pb-2">
        {items.map((media) => (
          <div key={media.id} className="w-[58vw] max-w-[16rem] sm:w-[16.5rem] sm:max-w-none">
            <Link
              href={`/m/${media.id}`}
              className="tile block aspect-video"
              aria-label={
                media.caption ||
                `${media.type === 'video' ? 'Video' : 'Photo'} shared by ${media.uploader_name}`
              }
            >
              {media.thumb_url ? (
                <img
                  src={media.thumb_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="h-full w-full animate-sweep" />
              )}

              {media.type === 'video' && (
                <span className="meta-mono absolute right-1.5 bottom-1.5 rounded-[0.25rem] bg-black/65 px-1.5 py-0.5 text-white/90">
                  {duration(media.duration_seconds) || '▶'}
                </span>
              )}
            </Link>

            <p className="mt-1.5 truncate px-0.5 text-[0.8125rem] leading-snug text-paper-soft">
              {media.caption || media.uploader_name}
            </p>
            <p className="meta-mono truncate px-0.5">{osdDate(media.taken_at)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
