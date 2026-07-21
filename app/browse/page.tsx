import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Shelf } from '@/components/Shelf'
import { requireSession } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { getEvents, getNewThisWeek, getPeople, getYears } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Wandering, not filing. Rows and shelves — never a folder tree. */
export default async function BrowsePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const session = await requireSession()
  const db = await createClient()

  const [newThisWeek, people, events, years] = await Promise.all([
    getNewThisWeek(db),
    getPeople(db),
    getEvents(db),
    getYears(db),
  ])

  const hasAnything = newThisWeek.length + people.length + events.length + years.length > 0

  return (
    <Shell session={session}>
      <h1 className="mt-6 mb-14 font-display text-display leading-none">Browse</h1>

      {!hasAnything && (
        <p className="max-w-md text-lg leading-relaxed text-paper-soft text-balance">
          Once there are a few memories in here, this fills up with people, events and years
          to wander through.
        </p>
      )}

      {newThisWeek.length > 0 && (
        <section className="mb-20">
          <Shelf title="New this week" items={newThisWeek} />
        </section>
      )}

      {people.length > 0 && (
        <Row title="People">
          {people.map((person) => (
            <Chip
              key={person.id}
              href={`/collection/person/${person.id}`}
              label={person.name}
              count={person.media_count}
            />
          ))}
        </Row>
      )}

      {events.length > 0 && (
        <Row title="Events">
          {events.map((event) => (
            <Chip
              key={event.id}
              href={`/collection/event/${event.id}`}
              label={event.name}
              count={event.media_count}
            />
          ))}
        </Row>
      )}

      {years.length > 0 && (
        <Row title="Years">
          {years.map((entry) => (
            <Chip
              key={entry.year}
              href={`/collection/year/${entry.year}`}
              label={String(entry.year)}
              count={entry.count}
            />
          ))}
        </Row>
      )}
    </Shell>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="mb-5 text-xs tracking-[0.2em] text-paper-faint uppercase">{title}</h2>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </section>
  )
}

function Chip({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-edge bg-ink-raised px-5 py-4 transition-all hover:border-edge-strong hover:bg-ink-hover"
    >
      <p className="font-display text-2xl leading-none transition-colors group-hover:text-ember">
        {label}
      </p>
      <p className="mt-1.5 text-xs text-paper-faint">
        {count} {count === 1 ? 'memory' : 'memories'}
      </p>
    </Link>
  )
}
