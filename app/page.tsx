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
      ? `${years[years.length - 1].year} — ${years[0].year}`
      : years.length === 1
        ? String(years[0].year)
        : null

  return (
    <Shell session={session}>
      {justArrived && media.length > 0 && <Welcome name={session.profile.display_name} />}

      {media.length > 0 && !justArrived && (
        <Masthead total={total} span={span} />
      )}

      {onThisDay.length > 0 && (
        <section className="mt-4 mb-24">
          <Shelf
            title={onThisDayTitle(onThisDay[0].taken_at)}
            subtitle="On this day"
            items={onThisDay}
          />
        </section>
      )}

      <section>
        {media.length > 0 && (
          <div className="mb-12 flex items-baseline justify-between border-b border-edge pb-5">
            <h2 className="font-display text-3xl text-balance italic">Recently added</h2>
            <span className="text-xs tracking-[0.25em] text-paper-faint uppercase">
              Newest first
            </span>
          </div>
        )}

        <Feed
          initial={media}
          initialCursor={media.length ? media[media.length - 1].created_at : null}
          emptyState={<FirstTime name={session.profile.display_name} />}
        />
      </section>
    </Shell>
  )
}

/** The archive announcing itself: name, count, and the years it spans. */
function Masthead({ total, span }: { total: number; span: string | null }) {
  return (
    <section className="mt-8 mb-16 animate-rise">
      <p className="mb-3 text-[11px] tracking-[0.4em] text-paper-faint uppercase">
        The family archive
      </p>
      <h1 className="font-display text-[clamp(3.5rem,10vw,7rem)] leading-[0.85] text-balance">
        {appName}
        <span className="text-ember">.</span>
      </h1>
      <p className="mt-5 text-sm text-paper-dim">
        {total} {total === 1 ? 'memory' : 'memories'}
        {span && (
          <>
            <span className="mx-2.5 text-paper-faint">·</span>
            <span className="tracking-wide">{span}</span>
          </>
        )}
      </p>
    </section>
  )
}

function Welcome({ name }: { name: string }) {
  return (
    <section className="mt-10 mb-16 animate-rise">
      <h2 className="font-display text-display leading-[0.95] text-balance">
        You&rsquo;re in,
        <br />
        <span className="text-paper-dim italic">{name}.</span>
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
    <div className="py-16 animate-rise">
      <h2 className="font-display text-display leading-[0.95] text-balance">
        Nothing here yet,
        <br />
        <span className="text-paper-dim italic">{name}.</span>
      </h2>

      <p className="mt-8 max-w-md text-lg leading-relaxed text-paper-soft text-balance">
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
