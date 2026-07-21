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
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            {subtitle && <p className="eyebrow mb-1.5">{subtitle}</p>}
            <h2 className="osd rgb-split text-title leading-none text-balance">{title}</h2>
          </div>
          {href && (
            <Link
              href={href}
              className="osd shrink-0 text-base text-paper-dim transition-colors hover:text-paper"
            >
              See all ▸
            </Link>
          )}
        </div>
      )}

      <div className="shelf pb-2">
        {items.map((media) => (
          <Link
            key={media.id}
            href={`/m/${media.id}`}
            className="group w-[72vw] max-w-64 sm:w-72 sm:max-w-none"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-ink-raised ring-1 ring-edge ring-inset">
              {media.thumb_url ? (
                <img
                  src={media.thumb_url}
                  width={media.width ?? undefined}
                  height={media.height ?? undefined}
                  alt={
                    media.caption ||
                    `${media.type === 'video' ? 'Video' : 'Photo'} shared by ${media.uploader_name}`
                  }
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full animate-sweep" />
              )}

              {media.type === 'video' && (
                <span className="osd osd-burn absolute top-3 left-3 text-sm">
                  ▶ PLAY {duration(media.duration_seconds)}
                </span>
              )}

              <span className="osd osd-burn absolute bottom-3 left-3 text-sm">
                {osdDate(media.taken_at)}
              </span>
            </div>

            <p className="hand mt-2.5 truncate text-xl leading-tight text-paper-soft">
              {media.caption || media.uploader_name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
