import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { CreateEvent } from '@/components/CreateEvent'
import { Avatar } from '@/components/Avatar'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { readDb } from '@/lib/db'
import { getBoardEvents } from '@/lib/community/events'
import { fullDate } from '@/lib/format'
import type { BoardEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The board — the planning surface. It holds what hasn't happened yet: plans,
 * flyers, and the talk before the thing exists. Once something happens it moves
 * to the Timeline, so the nav says the whole thesis without a word: Timeline is
 * the past, Board is the future.
 */
export default async function CommunityPage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const events = await getBoardEvents(readDb())

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-8 flex items-end justify-between gap-4 sm:mt-14">
        <div>
          <p className="eyebrow">The board</p>
          <h1 className="mt-3 text-[clamp(2.5rem,8vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-balance">
            What we&rsquo;re planning.
          </h1>
        </div>
      </header>

      <div className="mb-10">
        <CreateEvent />
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-edge px-6 py-16 text-center">
          <p className="text-lg text-paper-soft">Nothing planned yet.</p>
          <p className="mx-auto mt-2 max-w-md leading-relaxed text-paper-dim">
            Float an idea — a cookout, a trip, a birthday. Make a flyer, pick a date or don&rsquo;t,
            and let everyone react and talk before it&rsquo;s real. When it happens, it moves to the
            Timeline.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </Shell>
  )
}

function EventCard({ event }: { event: BoardEvent }) {
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
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-white text-balance">
            {event.name}
          </h3>
          <div className="mt-2 flex items-center gap-2 text-[0.8125rem] text-white/70">
            {event.host_name && (
              <span className="flex items-center gap-1.5">
                <Avatar name={event.host_name} src={event.host_avatar_url} size={20} />
                {event.host_name}
              </span>
            )}
            {event.comment_count > 0 && (
              <>
                <span className="text-white/40">·</span>
                <span className="meta-mono">
                  {event.comment_count} {event.comment_count === 1 ? 'reply' : 'replies'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
