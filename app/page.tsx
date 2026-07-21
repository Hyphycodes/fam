import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Feed } from '@/components/Feed'
import { Shell } from '@/components/Shell'
import { Shelf } from '@/components/Shelf'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireSession } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { getFeed, getOnThisDay } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { isRecent, yearsAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const session = await requireSession()
  const db = await createClient()

  const [media, onThisDay] = await Promise.all([getFeed(db, { limit: 12 }), getOnThisDay(db)])

  // Someone who joined in the last few minutes gets a hello rather than being
  // dropped straight into a stranger's photo feed.
  const justArrived = isRecent(session.profile.created_at, 15 * 60 * 1000)

  return (
    <Shell session={session}>
      {justArrived && media.length > 0 && <Welcome name={session.profile.display_name} />}

      {onThisDay.length > 0 && (
        <section className="mt-10 mb-20">
          <Shelf
            title={onThisDayTitle(onThisDay[0].taken_at)}
            subtitle="On this day"
            items={onThisDay}
          />
        </section>
      )}

      <section className="mt-10">
        {media.length > 0 && (
          <h2 className="mb-10 font-display text-title text-balance">Recently added</h2>
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
