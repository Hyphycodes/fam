import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { PeopleStack } from '@/components/PeopleStack'
import { duration, formatCapturedAt } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/**
 * A horizontal rail — the browsing surface of the whole app.
 *
 * Native momentum scroll with gentle snap; tiles are pure footage with the
 * quietest possible labeling. Three shapes: landscape media tiles, portrait
 * poster tiles (people), and labeled cover tiles (years, events).
 */

export function Rail({
  title,
  href,
  children,
}: {
  title: string
  href?: string
  children: React.ReactNode
}) {
  return (
    <section className="rail-section">
      <div className="mb-2.5 flex items-baseline justify-between gap-4">
        <h2 className="text-[0.9375rem] font-medium tracking-[-0.01em] text-paper">
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-xs text-paper-faint transition-colors hover:text-paper"
          >
            View all
          </Link>
        )}
      </div>
      <div className="rail">{children}</div>
    </section>
  )
}

/** A landscape frame of footage. The image is the whole story. */
export function MediaTile({ media }: { media: MediaView }) {
  const source = media.thumb_url ?? media.display_url

  return (
    <div className="w-[58vw] max-w-[16rem] sm:w-[16.5rem] sm:max-w-none">
      <Link
        href={`/m/${media.id}`}
        className="tile block aspect-video"
        aria-label={
          media.caption ||
          `${media.type === 'video' ? 'Video' : 'Photo'} shared by ${media.uploader_name}`
        }
      >
        {source ? (
          <img src={source} alt="" loading="lazy" decoding="async" />
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
      <div className="mt-0.5 flex items-center justify-between gap-2 px-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={media.uploader_name} src={media.uploader_avatar_url} size={16} />
          <span className="meta-mono truncate">
            {formatCapturedAt(media.taken_at, media.taken_precision, { style: 'osd' })}
          </span>
        </span>
        {media.people.length > 0 && <PeopleStack people={media.people} size={16} max={3} />}
      </div>
    </div>
  )
}

/** A portrait poster tile — used for people. */
export function PosterTile({
  href,
  label,
  count,
  cover,
}: {
  href: string
  label: string
  count: number
  cover?: MediaView
}) {
  const source = cover?.thumb_url ?? cover?.display_url

  return (
    <div className="w-[31vw] max-w-[8.25rem] sm:w-[8.75rem] sm:max-w-none">
      <Link
        href={href}
        className="tile block aspect-[2/3]"
      aria-label={`${label}, ${count} ${count === 1 ? 'item' : 'items'}`}
      >
        {source ? (
          <img src={source} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-ink-high text-3xl font-semibold text-white/15">
            {label.charAt(0)}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 truncate px-2 pb-1.5 text-[0.8125rem] font-medium text-white">
          {label}
        </span>
      </Link>
      <p className="meta-mono mt-1.5 px-0.5">{count} {count === 1 ? 'item' : 'items'}</p>
    </div>
  )
}

/** A landscape cover tile with a large quiet label — years and events. */
export function CoverTile({
  href,
  label,
  sublabel,
  cover,
}: {
  href: string
  label: string
  sublabel?: string
  cover?: MediaView
}) {
  const source = cover?.thumb_url ?? cover?.display_url

  return (
    <Link
      href={href}
      className="tile block aspect-video w-[44vw] max-w-[12.5rem] sm:w-[13rem] sm:max-w-none"
      aria-label={sublabel ? `${label}, ${sublabel}` : label}
    >
      {source ? (
        <img src={source} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="block h-full w-full bg-ink-high" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 px-3 pb-2">
        <span className="block truncate text-lg font-semibold tracking-[-0.02em] text-white">
          {label}
        </span>
        {sublabel && <span className="meta-mono block text-white/60">{sublabel}</span>}
      </span>
    </Link>
  )
}
