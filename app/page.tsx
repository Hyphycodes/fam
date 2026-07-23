import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { VideoFrame } from '@/components/VideoFrame'
import { Rail, MediaTile } from '@/components/Rail'
import { Avatar } from '@/components/Avatar'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { readDb } from '@/lib/db'
import { getHomeData } from '@/lib/home'
import { formatCapturedAt, fullDate, season } from '@/lib/format'
import type { BoardEvent, MediaView } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The front door. A few considered invitations — never the same memory five
 * times. Global de-dup and graceful thinness live in getHomeData; this file
 * renders whatever survived, and every empty section is simply absent.
 */
export default async function HomePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  await reconcileProcessingVideos()

  const home = await getHomeData(db)

  // Truly empty — no media, nothing planned — is the only first-run state.
  if (!home.hasMedia && home.comingUp.length === 0) {
    return (
      <Shell viewer={viewer}>
        <FirstTime name={viewer.display_name} />
      </Shell>
    )
  }

  return (
    <Shell viewer={viewer} immersive={Boolean(home.featured)}>
      {home.featured && <Billboard media={home.featured} />}

      <div className="mt-10 flex flex-col gap-14 sm:mt-12 sm:gap-16">
        {home.onThisDay.length > 0 && (
          <Rail title="On this day">
            {home.onThisDay.map((media) => (
              <MediaTile key={media.id} media={media} />
            ))}
          </Rail>
        )}

        {home.comingUp.length > 0 && (
          <section aria-labelledby="coming-up">
            <Heading id="coming-up" eyebrow="The future" title="Coming up" href="/community" />
            <div className="grid gap-4 sm:grid-cols-2">
              {home.comingUp.map((event) => (
                <PlannedCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {home.jumpBack.length > 0 && (
          <section aria-labelledby="jump-back">
            <Heading id="jump-back" eyebrow="The past" title="Jump back in" href="/timeline" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {home.jumpBack.map((entry) => (
                <YearCard key={entry.year} year={entry.year} count={entry.count} />
              ))}
            </div>
          </section>
        )}

        {home.recentlyAdded.length > 0 && (
          <Rail title="Recently added">
            {home.recentlyAdded.map((media) => (
              <MediaTile key={media.id} media={media} />
            ))}
          </Rail>
        )}

        {home.hasMedia && <FamilyTV cover={home.recentlyAdded[0] ?? home.featured} />}

        <section aria-labelledby="collections">
          <Heading id="collections" eyebrow="The archive" title="Collections" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <NavTile href="/timeline?type=photo" title="Photos" detail="Every still" />
            <NavTile href="/timeline?type=video" title="Videos" detail="Every clip" />
            <NavTile href="/albums" title="Albums" detail="Kept together" />
            <NavTile href="/community" title="Events" detail="Planned & past" />
            <NavTile href="/community" title="Artifacts" detail="Flyers & more" />
          </div>
        </section>
      </div>
    </Shell>
  )
}

function Heading({
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
        <Link href={href} className="mb-1 shrink-0 text-sm text-paper-faint transition-colors hover:text-paper">
          View all
        </Link>
      )}
    </div>
  )
}

function PlannedCard({ event }: { event: BoardEvent }) {
  const image = event.flyer_url ?? event.cover_url

  return (
    <Link href={`/community/${event.id}`} className="tile group block">
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="block h-full w-full bg-ink-high" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-ink uppercase">
          Planned
        </span>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="meta-mono mb-1 text-white/70">
            {event.starts_at ? fullDate(event.starts_at) : 'Someday'}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-white text-balance">{event.name}</h3>
          {event.host_name && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-white/70">
              <Avatar name={event.host_name} src={event.host_avatar_url} size={20} />
              {event.host_name}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

function YearCard({ year, count }: { year: number; count: number }) {
  return (
    <Link
      href={`/timeline?year=${year}`}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-xl border border-edge bg-ink-raised p-4 transition-colors hover:bg-ink-high"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.06),transparent_55%)]" />
      <span className="relative font-display text-4xl tracking-[-0.02em] text-paper">{year}</span>
      <span className="relative meta-mono mt-1 text-paper-faint">
        {count} {count === 1 ? 'memory' : 'memories'}
      </span>
    </Link>
  )
}

function FamilyTV({ cover }: { cover: MediaView | null }) {
  const still = cover?.thumb_url ?? cover?.display_url
  return (
    <Link
      href="/movie?source=archive&mode=shuffle"
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl bg-ink-raised sm:aspect-[21/9]"
      aria-label="Family TV — play the archive, shuffled"
    >
      {still ? (
        <img
          src={still}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
        />
      ) : (
        <span className="absolute inset-0 bg-ink-high" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="grid size-16 place-items-center rounded-full bg-white text-ink shadow-lg transition-transform group-hover:scale-105">
          <PlayGlyph className="h-6 w-6" />
        </span>
        <span className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Family TV</span>
        <span className="mt-1 text-sm text-white/70">Sit back — the whole archive, shuffled.</span>
      </div>
    </Link>
  )
}

function NavTile({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-xl border border-edge bg-ink-raised p-4 transition-colors hover:bg-ink-high"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.05),transparent_50%)]" />
      <span className="relative block text-lg font-semibold tracking-[-0.02em] text-paper">{title}</span>
      <span className="relative mt-0.5 block text-xs text-paper-faint">{detail}</span>
    </Link>
  )
}

function Billboard({ media }: { media: MediaView }) {
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
          <img src={still} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover animate-fade" />
        ) : null}

        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/45 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl px-5 pb-8 sm:px-6 sm:pb-12">
          <p className="eyebrow animate-rise text-white/60">Featured memory</p>
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
          <div className="mt-5 flex items-center gap-3 animate-rise" style={{ animationDelay: '180ms' }}>
            <Link href={`/m/${media.id}`} className="btn btn-primary">
              <PlayGlyph /> Open
            </Link>
            <Link href="/movie?source=archive&mode=shuffle" className="btn btn-ghost backdrop-blur-sm">
              Shuffle
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlayGlyph({ className }: { className?: string } = {}) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
        Add a few photos or videos, then keep the day together in an album — or plan something on the Board.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <AddMemoriesButton variant="hero" />
        <Link href="/community" className="btn btn-ghost">
          Plan something
        </Link>
      </div>
    </div>
  )
}
