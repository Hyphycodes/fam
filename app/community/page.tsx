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

/** The community board: everything the family is throwing, or has thrown. */
export default async function CommunityPage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const events = await getBoardEvents(readDb())

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = events.filter((e) => e.event_date && e.event_date >= today)
  const past = events.filter((e) => !e.event_date || e.event_date < today)

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-8 flex items-end justify-between gap-4 sm:mt-14">
        <div>
          <p className="eyebrow">The board</p>
          <h1 className="mt-3 text-[clamp(2.5rem,8vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-balance">
            What we&rsquo;re up to.
          </h1>
        </div>
      </header>

      <div className="mb-10">
        <CreateEvent />
      </div>

      {events.length === 0 ? (
        <p className="max-w-md leading-relaxed text-paper-dim">
          No events yet. Post the next cookout, birthday, or trip — everyone can add their
          photos to it afterward.
        </p>
      ) : (
        <div className="space-y-12">
          {upcoming.length > 0 && (
            <Section title="Coming up">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} upcoming />
              ))}
            </Section>
          )}
          {past.length > 0 && (
            <Section title="Already happened">
              {past.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </Section>
          )}
        </div>
      )}
    </Shell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-[0.9375rem] font-medium text-paper-soft">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function EventCard({ event, upcoming = false }: { event: BoardEvent; upcoming?: boolean }) {
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
        {upcoming && (
          <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-ink uppercase">
            Upcoming
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4">
          {event.event_date && (
            <p className="meta-mono mb-1 text-white/70">{fullDate(event.event_date)}</p>
          )}
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
            <span className="text-white/40">·</span>
            <span className="meta-mono">
              {event.media_count} {event.media_count === 1 ? 'photo' : 'photos'}
            </span>
            {event.comment_count > 0 && (
              <>
                <span className="text-white/40">·</span>
                <span className="meta-mono">{event.comment_count}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
