import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { VideoFrame } from '@/components/VideoFrame'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { getBrowseCovers, getEvents, getFeed, getOnThisDay } from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { readDb } from '@/lib/db'
import { dailyIndex, formatCapturedAt, fullDate, season } from '@/lib/format'
import type { MediaView } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Home is the answer to "what should we relive next?" It deliberately deals
 * in a few considered invitations, while the Browse and album routes retain
 * the exhaustive archive views.
 */
export default async function HomePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()

  // Catch any video whose uploader closed the tab before Cloudflare finished.
  await reconcileProcessingVideos()

  const [archive, onThisDay, favorites, events, photoCover, videoCover] = await Promise.all([
    getFeed(db, { limit: 72 }),
    getOnThisDay(db),
    getFeed(db, { favorite: true, limit: 24 }),
    getEvents(db),
    getFeed(db, { mediaType: 'photo', limit: 1 }),
    getFeed(db, { mediaType: 'video', limit: 1 }),
  ])
  const albums = events.filter((event) => event.media_count > 0).slice(0, 10)
  const covers = await getBrowseCovers(db, { people: [], events: albums, years: [] })

  // A dated memory gets first dibs. When there isn't one, favorites are the
  // natural place to start; a stable daily index keeps the page from feeling
  // like a latest-upload dashboard.
  const dated = onThisDay.filter((memory) => memory.display_url || memory.thumb_url)
  const featuredPool = (
    dated.length > 0 ? dated : favorites.length > 0 ? favorites : archive
  ).filter((memory) => memory.display_url || memory.thumb_url)
  const featured = featuredPool.length > 0 ? featuredPool[dailyIndex(featuredPool.length)] : null
  const shufflePool = archive.filter(
    (memory) => memory.id !== featured?.id && (memory.display_url || memory.thumb_url),
  )
  const shuffle = shufflePool.length > 0 ? shufflePool[dailyIndex(shufflePool.length)] : null

  return (
    <Shell viewer={viewer} immersive={Boolean(featured)}>
      {featured && (
        <Billboard
          media={featured}
          eyebrow={dated.length > 0 ? 'On this day' : 'Featured memory'}
        />
      )}

      {archive.length === 0 ? (
        <FirstTime name={viewer.display_name} />
      ) : (
        <div className="mt-10 flex flex-col gap-14 sm:mt-12 sm:gap-18">
          {albums.length > 0 && (
            <section aria-labelledby="recent-albums">
              <SectionHeading
                id="recent-albums"
                eyebrow="Experiences"
                title="Recently added albums"
                href="/albums"
              />
              <div className="home-album-rail">
                {albums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    href={`/collection/event/${album.id}`}
                    name={album.name}
                    date={album.event_date}
                    count={album.media_count}
                    cover={covers.events.get(album.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {shuffle && <ShuffleCard media={shuffle} />}

          <section aria-labelledby="home-collections">
            <SectionHeading
              id="home-collections"
              eyebrow="The archive"
              title="Collections"
              href="/browse"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CollectionCard
                href="/browse"
                title="Photos"
                detail="Every still"
                cover={photoCover[0]}
              />
              <CollectionCard
                href="/browse"
                title="Videos"
                detail="Every moving memory"
                cover={videoCover[0]}
              />
              <CollectionCard
                href="/movie?source=archive&mode=shuffle"
                title="Family TV"
                detail="Play the family film"
                cover={featured ?? shuffle ?? photoCover[0] ?? videoCover[0]}
                play
              />
            </div>
          </section>
        </div>
      )}
    </Shell>
  )
}

function SectionHeading({
  id,
  eyebrow,
  title,
  href,
}: {
  id: string
  eyebrow: string
  title: string
  href?: string
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h2 id={id} className="text-2xl font-semibold tracking-[-0.025em] text-paper sm:text-3xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="mb-1 shrink-0 text-sm text-paper-faint transition-colors hover:text-paper"
        >
          View all
        </Link>
      )}
    </div>
  )
}

function AlbumCard({
  href,
  name,
  date,
  count,
  cover,
}: {
  href: string
  name: string
  date: string | null
  count: number
  cover?: MediaView
}) {
  const source = cover?.thumb_url ?? cover?.display_url
  const memories = `${count} ${count === 1 ? 'memory' : 'memories'}`

  return (
    <Link
      href={href}
      className="home-album-card group"
      aria-label={`${name}, ${date ? `${fullDate(date)}, ` : ''}${memories}`}
    >
      {source ? (
        <img src={source} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="home-album-fallback" aria-hidden="true">
          {name.charAt(0)}
        </span>
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <span className="block text-xl leading-tight font-semibold tracking-[-0.025em] text-white sm:text-2xl">
          {name}
        </span>
        <span className="meta-mono mt-2 block text-white/65">
          {date ? `${fullDate(date)} · ` : ''}
          {memories}
        </span>
      </span>
    </Link>
  )
}

function ShuffleCard({ media }: { media: MediaView }) {
  const source = media.thumb_url ?? media.display_url
  const title = media.caption || media.event_name || season(media.taken_at)

  return (
    <section aria-labelledby="shuffle-title">
      <SectionHeading id="shuffle-title" eyebrow="One more thing" title="Shuffle" />
      <Link
        href={`/m/${media.id}`}
        className="group relative block min-h-64 overflow-hidden rounded-xl bg-ink-raised sm:min-h-80"
        aria-label={`Open ${title}`}
      >
        {source ? (
          <img
            src={source}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025]"
          />
        ) : (
          <span className="absolute inset-0 animate-sweep" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <span className="eyebrow text-white/60">A memory to return to</span>
          <span className="mt-2 block max-w-xl text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">
            {title}
          </span>
          <span className="meta-mono mt-2 block text-white/65">{formatCapturedAt(media.taken_at, media.taken_precision)}</span>
        </span>
      </Link>
    </section>
  )
}

function CollectionCard({
  href,
  title,
  detail,
  cover,
  play = false,
}: {
  href: string
  title: string
  detail: string
  cover?: MediaView | null
  play?: boolean
}) {
  const source = cover?.thumb_url ?? cover?.display_url

  return (
    <Link
      href={href}
      className="group relative block aspect-[16/10] overflow-hidden rounded-xl bg-ink-raised"
    >
      {source ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="absolute inset-0 bg-ink-high" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/5" />
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <span>
          <span className="block text-lg font-semibold tracking-[-0.02em] text-white">{title}</span>
          <span className="mt-1 block text-xs text-white/65">{detail}</span>
        </span>
        {play && <PlayGlyph className="mb-0.5 h-8 w-8 rounded-full bg-white p-2 text-ink" />}
      </span>
    </Link>
  )
}

function Billboard({ media, eyebrow }: { media: MediaView; eyebrow: string }) {
  const still = media.display_url ?? media.thumb_url
  const title = media.caption || media.event_name || season(media.taken_at)

  return (
    <section className="full-bleed relative overflow-hidden bg-ink-raised">
      <div className="relative h-[68svh] max-h-[42rem] min-h-[26rem]">
        {media.type === 'video' && media.iframe_url ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <VideoFrame
              src={media.iframe_url}
              poster={still}
              autoplay
              muted
              loop
              controls={false}
              className="h-full w-full scale-[1.35] object-cover sm:scale-100"
              title=""
            />
          </div>
        ) : still ? (
          <img
            src={still}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover animate-fade"
          />
        ) : null}

        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/45 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl px-5 pb-8 sm:px-6 sm:pb-12">
          <p className="eyebrow animate-rise text-white/60">{eyebrow}</p>
          <h1
            className="mt-2 max-w-2xl text-[clamp(1.85rem,5.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-white text-balance animate-rise"
            style={{ animationDelay: '60ms' }}
          >
            {title}
          </h1>
          <p
            className="meta-mono mt-2.5 flex flex-wrap items-center gap-x-2 text-white/60 animate-rise"
            style={{ animationDelay: '120ms' }}
          >
            {formatCapturedAt(media.taken_at, media.taken_precision)}
            {media.event_name && media.event_name !== title && (
              <>
                <span className="text-white/30">·</span>
                {media.event_name}
              </>
            )}
          </p>
          <div
            className="mt-5 flex items-center gap-3 animate-rise"
            style={{ animationDelay: '180ms' }}
          >
            <Link href={`/m/${media.id}`} className="btn btn-primary">
              <PlayGlyph /> {media.type === 'video' ? 'Play memory' : 'View memory'}
            </Link>
            <Link href="/movie?source=archive&mode=shuffle" className="btn btn-ghost backdrop-blur-sm">
              Family TV
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlayGlyph({ className }: { className?: string } = {}) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function FirstTime({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center animate-rise sm:py-32">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
        The first memory is waiting, {name}.
      </h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-dim text-balance">
        Add a few photos or videos, then keep the day together in an album.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <AddMemoriesButton variant="hero" />
        <Link href="/albums" className="btn btn-ghost">
          Make an album
        </Link>
      </div>
    </div>
  )
}
