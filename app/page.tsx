import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CoverTile, MediaTile, PosterTile, Rail } from '@/components/Rail'
import { Shell } from '@/components/Shell'
import { VideoFrame } from '@/components/VideoFrame'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireSession } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import {
  getBrowseCovers,
  getEvents,
  getFeed,
  getNewThisWeek,
  getOnThisDay,
  getPeople,
  getYears,
} from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/server'
import { dailyIndex, fullDate, isRecent, season, yearsAgo } from '@/lib/format'
import type { MediaView } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const session = await requireSession()
  const db = await createClient()

  // Catch any video whose uploader closed the tab before Cloudflare finished —
  // without this, a transcoded video could sit invisible forever.
  await reconcileProcessingVideos()

  const [recent, newThisWeek, onThisDay, favorites, people, events, years] =
    await Promise.all([
      getFeed(db, { limit: 18 }),
      getNewThisWeek(db),
      getOnThisDay(db),
      getFeed(db, { favorite: true, limit: 18 }),
      getPeople(db),
      getEvents(db),
      getYears(db),
    ])
  const covers = await getBrowseCovers(db, { people, events, years })

  // The billboard: today's pick from the favorites, or the newest memory.
  // Day-of-year keeps it stable for the day and fresh tomorrow.
  const heroPool = (favorites.length > 0 ? favorites : recent).filter(
    (m) => m.display_url || m.thumb_url,
  )
  const hero = heroPool.length > 0 ? heroPool[dailyIndex(heroPool.length)] : null

  const justArrived = isRecent(session.profile.created_at, 15 * 60 * 1000)

  return (
    <Shell session={session} immersive={Boolean(hero)}>
      {hero && <Billboard media={hero} />}

      {justArrived && recent.length > 0 && (
        <p className="mx-auto mt-8 max-w-xl text-center text-[0.9375rem] leading-relaxed text-paper-dim">
          Welcome, {session.profile.display_name}. Everything here is ours — scroll it,
          open anything, add your own with the plus below.
        </p>
      )}

      {recent.length === 0 ? (
        <FirstTime name={session.profile.display_name} />
      ) : (
        <div className="mt-10 flex flex-col gap-9 sm:mt-12 sm:gap-11">
          {newThisWeek.length > 0 && (
            <Rail title="New this week">
              {newThisWeek.map((m) => (
                <MediaTile key={m.id} media={m} />
              ))}
            </Rail>
          )}

          <Rail title="Recently added" href="/browse">
            {recent.map((m) => (
              <MediaTile key={m.id} media={m} />
            ))}
          </Rail>

          {onThisDay.length > 0 && (
            <Rail title={onThisDayTitle(onThisDay[0].taken_at)}>
              {onThisDay.map((m) => (
                <MediaTile key={m.id} media={m} />
              ))}
            </Rail>
          )}

          <MovieModeCard backdrop={heroPool[1] ?? recent[0]} />

          {favorites.length > 0 && (
            <Rail title="Favorites">
              {favorites.map((m) => (
                <MediaTile key={m.id} media={m} />
              ))}
            </Rail>
          )}

          {years.length > 1 && (
            <Rail title="By year" href="/browse">
              {years.map((entry) => (
                <CoverTile
                  key={entry.year}
                  href={`/collection/year/${entry.year}`}
                  label={String(entry.year)}
                  sublabel={`${entry.count} ${entry.count === 1 ? 'memory' : 'memories'}`}
                  cover={covers.years.get(entry.year)}
                />
              ))}
            </Rail>
          )}

          {people.length > 0 && (
            <Rail title="People" href="/browse">
              {people.map((person) => (
                <PosterTile
                  key={person.id}
                  href={`/collection/person/${person.id}`}
                  label={person.name}
                  count={person.media_count}
                  cover={covers.people.get(person.id)}
                />
              ))}
            </Rail>
          )}

          {events.length > 0 && (
            <Rail title="Events" href="/browse">
              {events.map((event) => (
                <CoverTile
                  key={event.id}
                  href={`/collection/event/${event.id}`}
                  label={event.name}
                  sublabel={event.event_date ? fullDate(event.event_date) : undefined}
                  cover={covers.events.get(event.id)}
                />
              ))}
            </Rail>
          )}
        </div>
      )}
    </Shell>
  )
}

/**
 * The billboard. One memory fills the top of the screen; if it's a video, a
 * muted preview plays behind the title. Everything else is scrim and type.
 */
function Billboard({ media }: { media: MediaView }) {
  const still = media.display_url ?? media.thumb_url
  const title = media.caption || season(media.taken_at)

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

        {/* Scrims: enough for the header and the title to read, no more. */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/45 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl px-5 pb-8 sm:px-6 sm:pb-12">
          <p className="eyebrow animate-rise">Featured memory</p>
          <h1
            className="mt-2 max-w-2xl text-[clamp(1.85rem,5.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-white text-balance animate-rise"
            style={{ animationDelay: '60ms' }}
          >
            {title}
          </h1>
          <p
            className="meta-mono mt-2.5 text-white/60 animate-rise"
            style={{ animationDelay: '120ms' }}
          >
            {fullDate(media.taken_at)}
            <span className="mx-2 text-white/30">·</span>
            {media.uploader_name}
            {media.event_name && (
              <>
                <span className="mx-2 text-white/30">·</span>
                {media.event_name}
              </>
            )}
          </p>
          <div
            className="mt-5 flex items-center gap-3 animate-rise"
            style={{ animationDelay: '180ms' }}
          >
            <Link href={`/m/${media.id}`} className="btn btn-primary">
              <PlayGlyph /> Play
            </Link>
            <Link href="/movie" className="btn btn-ghost backdrop-blur-sm">
              Movie Mode
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/** A wide, quiet invitation to lean back. Footage behind, two lines on top. */
function MovieModeCard({ backdrop }: { backdrop?: MediaView }) {
  const source = backdrop?.thumb_url ?? backdrop?.display_url

  return (
    <Link
      href="/movie"
      className="tile group block aspect-[21/8] min-h-[7.5rem] w-full"
      aria-label="Start Movie Mode"
    >
      {source && <img src={source} alt="" loading="lazy" decoding="async" />}
      <span className="absolute inset-0 bg-black/60 transition-colors duration-300 group-hover:bg-black/50" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
        <span className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.01em] text-white sm:text-xl">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink transition-transform duration-300 group-hover:scale-105">
            <PlayGlyph />
          </span>
          Movie Mode
        </span>
        <span className="text-[0.8125rem] text-white/60">
          The whole archive, cut together for the big screen
        </span>
      </span>
    </Link>
  )
}

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function onThisDayTitle(takenAt: string): string {
  const years = yearsAgo(takenAt)
  if (years <= 0) return 'Earlier today'
  if (years === 1) return 'A year ago today'
  return `${years} years ago today`
}

function FirstTime({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center animate-rise sm:py-32">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
        Nothing here yet, {name}.
      </h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-dim text-balance">
        Add the first one — a photo, an old video, something from your camera roll you
        keep meaning to show everyone. It plays for the whole family the moment it lands.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <AddMemoriesButton variant="hero" />
        <Link href="/settings" className="btn btn-ghost">
          Invite the family
        </Link>
      </div>
    </div>
  )
}
