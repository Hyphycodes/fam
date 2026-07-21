import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Feed } from '@/components/Feed'
import { Shell } from '@/components/Shell'
import { Shelf } from '@/components/Shelf'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireSession } from '@/lib/auth'
import { appName, isConfigured } from '@/lib/env'
import { getFeed, getOnThisDay, getYears } from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/server'
import { isRecent, yearsAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const session = await requireSession()
  const db = await createClient()

  // Catch any video whose uploader closed the tab before Cloudflare finished —
  // without this, a transcoded video could sit invisible forever.
  await reconcileProcessingVideos()

  const [media, onThisDay, years] = await Promise.all([
    getFeed(db, { limit: 12 }),
    getOnThisDay(db),
    getYears(db),
  ])

  // Someone who joined in the last few minutes gets a hello rather than being
  // dropped straight into a stranger's photo feed.
  const justArrived = isRecent(session.profile.created_at, 15 * 60 * 1000)

  const total = years.reduce((sum, y) => sum + y.count, 0)
  const span =
    years.length > 1
      ? `${years[years.length - 1].year}–${years[0].year}`
      : years.length === 1
        ? String(years[0].year)
        : null

  return (
    <Shell session={session}>
      {justArrived && media.length > 0 && <Welcome name={session.profile.display_name} />}

      {media.length > 0 && !justArrived && <Masthead total={total} span={span} />}

      <section>
        {media.length > 0 && (
          <div className="mb-8 flex items-end justify-between border-b border-edge pb-4 sm:mb-12">
            <div>
              <p className="eyebrow mb-1.5">▸ Now playing</p>
              <h2 className="osd rgb-split text-4xl text-balance sm:text-5xl">
                Recently added
              </h2>
            </div>
            <span className="osd hidden text-sm text-paper-faint sm:block">
              Newest first
            </span>
          </div>
        )}

        <Feed
          initial={media}
          initialCursor={media.length ? media[media.length - 1].created_at : null}
          featuredFirst
          afterFeatured={
            onThisDay.length > 0 ? (
              <section className="border-y border-edge py-10 sm:py-14">
                <Shelf
                  title={onThisDayTitle(onThisDay[0].taken_at)}
                  subtitle="⏮ On this day"
                  items={onThisDay}
                />
              </section>
            ) : null
          }
          emptyState={<FirstTime name={session.profile.display_name} />}
        />
      </section>
    </Shell>
  )
}

/** The archive announcing itself through a camcorder viewfinder: REC light,
 *  tape counter, and the family's title burned in like an OSD titler. */
function Masthead({ total, span }: { total: number; span: string | null }) {
  return (
    <section className="home-masthead mt-8 mb-14 animate-rise sm:mt-12 sm:mb-20">
      <div className="viewfinder tracking-wobble relative px-5 py-6 sm:px-8 sm:py-9">
        <div className="osd osd-burn flex items-center justify-between text-base sm:text-lg">
          <span className="flex items-center gap-2.5 text-rec" aria-hidden="true">
            <span className="rec-dot" /> REC
          </span>
          <span className="text-paper-soft">
            SP<span className="mx-2 text-paper-faint">·</span>{appName}
          </span>
        </div>

        <h1 className="osd rgb-split mt-8 text-[clamp(3.3rem,11vw,7.5rem)] leading-[0.88] text-balance sm:mt-12">
          The story
          <br />
          of us<span className="cursor-blink text-ember" aria-hidden="true">▮</span>
        </h1>
        <p className="osd mt-3 text-[clamp(1.15rem,3.4vw,1.8rem)] text-ember">
          ▸ Still playing
        </p>

        <div className="osd osd-burn mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-paper-soft sm:mt-14 sm:text-lg">
          <span>CNT {String(total).padStart(4, '0')}</span>
          {span && <span>TAPE {span}</span>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-6 sm:mt-8">
        <p className="max-w-md text-sm leading-relaxed text-paper-dim sm:text-base">
          The photographs, home movies, voices and small moments that become a
          family history — kept close, and made to be watched together.
        </p>

        <Link href="/movie" className="movie-invitation group">
          <span className="grid h-11 w-11 place-items-center rounded-[0.45rem] bg-ember text-[#221302] shadow-[0_0_20px_-4px_rgba(255,180,94,0.7)] transition-transform group-hover:scale-105">
            <span className="ml-0.5 text-sm" aria-hidden="true">▶</span>
          </span>
          <span>
            <span className="osd block text-base leading-tight text-paper">Play all</span>
            <span className="osd mt-0.5 block text-sm leading-tight text-paper-dim">
              Movie mode · the big screen
            </span>
          </span>
        </Link>
      </div>
    </section>
  )
}

function Welcome({ name }: { name: string }) {
  return (
    <section className="mt-10 mb-16 animate-rise">
      <p className="eyebrow mb-4">
        <span className="rec-dot mr-2 align-middle" aria-hidden="true" />
        New viewer detected
      </p>
      <h2 className="osd rgb-split text-[clamp(3rem,10vw,5.5rem)] leading-[0.9] text-balance">
        You&rsquo;re in,
        <br />
        <span className="hand normal-case tracking-normal text-ember-soft">{name}.</span>
      </h2>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-paper-soft text-balance">
        Everything below is ours. Scroll it, react to it, leave a note — and add whatever
        you&rsquo;ve got on your phone with the <span className="text-ember">+</span> at the
        bottom. When we&rsquo;re all together, hit Movie&nbsp;Mode and put it on the TV.
      </p>
    </section>
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
    <div className="py-10 animate-rise sm:py-16">
      <div className="no-signal aspect-[16/9] w-full rounded-lg ring-1 ring-edge ring-inset">
        <div className="relative z-10 text-center">
          <p className="osd text-[clamp(2rem,7vw,3.75rem)] leading-none text-[#dce8fa]">
            No signal
          </p>
          <p className="osd mt-3 text-sm text-[#8fa5c8] sm:text-base">
            Insert first memory to begin
          </p>
        </div>
      </div>

      <h2 className="osd rgb-split mt-10 text-[clamp(2.6rem,8vw,4.5rem)] leading-[0.9] text-balance">
        Nothing here yet,
        <br />
        <span className="hand normal-case tracking-normal text-ember-soft">{name}.</span>
      </h2>

      <p className="mt-6 max-w-md text-lg leading-relaxed text-paper-soft text-balance">
        Add the first one. A photo, an old video, something from your camera roll you keep
        meaning to show everyone. It plays for the whole family the moment it lands.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <AddMemoriesButton variant="hero" />
        <Link href="/settings" className="btn btn-ghost">
          Invite the family
        </Link>
      </div>
    </div>
  )
}
