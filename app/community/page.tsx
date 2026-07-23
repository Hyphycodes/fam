import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { CreateEvent } from '@/components/CreateEvent'
import { EventCover } from '@/components/EventCover'
import { EventTitle } from '@/components/EventTitle'
import { Avatar } from '@/components/Avatar'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { readDb } from '@/lib/db'
import { getBoardEvents, getPastEvents } from '@/lib/community/events'
import { fullDate } from '@/lib/format'
import type { BoardEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The board — the event surface (the Timeline is the media surface). It holds
 * whole events across their life: what's planned up top, flyer-forward and
 * large; everything that has happened below, in a denser past grid. The nav
 * still says the thesis without a word: Timeline is the loose stream of
 * memories, Board is the events they belong to.
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  const params = await searchParams

  const [planned, past] = await Promise.all([getBoardEvents(db), getPastEvents(db)])
  const empty = planned.length === 0 && past.length === 0

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-8 sm:mt-14">
        <p className="eyebrow">The board</p>
        <h1 className="mt-3 text-[clamp(2.5rem,8vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-balance">
          Plans and memories.
        </h1>
      </header>

      <div className="mb-10">
        <CreateEvent defaultOpen={params.create === '1'} />
      </div>

      {empty ? (
        <div className="rounded-2xl border border-dashed border-edge px-6 py-16 text-center">
          <p className="text-lg text-paper-soft">Nothing here yet.</p>
          <p className="mx-auto mt-2 max-w-md leading-relaxed text-paper-dim">
            Float an idea — a cookout, a trip, a birthday. Make a flyer, pick a date or don&rsquo;t,
            and let everyone react and talk before it&rsquo;s real. Add something that already
            happened and it joins the Timeline too.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          <section aria-labelledby="planned">
            <SectionHeader id="planned" title="Planned" hint="What hasn’t happened yet" />
            {planned.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {planned.map((event) => (
                  <PlannedCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-edge px-5 py-8 text-center text-sm text-paper-dim">
                Nothing planned yet — float an idea above.
              </p>
            )}
          </section>

          {/* Upcoming — the RSVP surface arrives in a later prompt; stubbed for now. */}

          {past.length > 0 && (
            <section aria-labelledby="past">
              <SectionHeader id="past" title="Past" hint="Everything that happened" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {past.map((event) => (
                  <PastCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Shell>
  )
}

function SectionHeader({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.025em] text-paper">
        {title}
      </h2>
      <p className="mt-1 text-sm text-paper-faint">{hint}</p>
    </div>
  )
}

/** A plan — flyer-forward and portrait (4:5), because flyers are portrait.
 *  Content order: cover, then title (leads), date, status, creator. */
function PlannedCard({ event }: { event: BoardEvent }) {
  return (
    <Link href={`/community/${event.id}`} className="tile group block">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl">
        <EventCover
          src={event.flyer_url ?? event.cover_url}
          name={event.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <EventTitle
            name={event.name}
            className="block text-xl font-semibold tracking-[-0.02em] text-white text-balance"
            emojiClassName="block text-4xl leading-none"
          />
          <p className="meta-mono mt-1.5 text-white/70">
            {event.starts_at ? fullDate(event.starts_at) : 'Someday'}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="rounded-full bg-white px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-ink uppercase">
              Planned
            </span>
            {event.host_name && (
              <span className="flex items-center gap-1.5 text-[0.8125rem] text-white/70">
                <Avatar name={event.host_name} src={event.host_avatar_url} size={20} />
                {event.host_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

/** A memory — square (1:1), denser. Cover, title, date, creator; "past" is the
 *  section, so it carries no badge. */
function PastCard({ event }: { event: BoardEvent }) {
  return (
    <Link href={`/community/${event.id}`} className="tile group block">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        <EventCover
          src={event.cover_url ?? event.flyer_url}
          name={event.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <EventTitle
            name={event.name}
            className="block truncate text-sm font-semibold tracking-[-0.01em] text-white"
            emojiClassName="block text-2xl leading-none"
          />
          <p className="meta-mono mt-1 truncate text-white/60">
            {event.event_date ? fullDate(event.event_date) : 'Completed'}
            {event.media_count > 0 ? ` · ${event.media_count}` : ''}
          </p>
        </div>
      </div>
    </Link>
  )
}
