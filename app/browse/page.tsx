import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Shelf } from '@/components/Shelf'
import { requireViewer } from '@/lib/viewer'
import { fullDate } from '@/lib/format'
import { isConfigured } from '@/lib/env'
import {
  getBrowseCovers,
  getEvents,
  getFeed,
  getNewThisWeek,
  getPeople,
  getYears,
} from '@/lib/queries'
import { readDb } from '@/lib/db'
import type { MediaView } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Wandering, not filing. Every destination begins with a real frame. */
export default async function BrowsePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()

  const [newThisWeek, favorites, people, events, years] = await Promise.all([
    getNewThisWeek(db),
    getFeed(db, { favorite: true, limit: 24 }),
    getPeople(db),
    getEvents(db),
    getYears(db),
  ])
  const covers = await getBrowseCovers(db, { people, events, years })
  const total = years.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <Shell viewer={viewer}>
      <header className="browse-intro mt-8 mb-12 sm:mt-14 sm:mb-16">
        <p className="eyebrow">Browse</p>
        <h1 className="mt-3 max-w-3xl text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-balance">
          Every face opens another chapter.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-paper-soft">
          Find the newest additions, gather around the people and days that shaped the
          family, or step back through the years.
        </p>
        {total > 0 && (
          <p className="mt-5 text-xs tracking-[0.18em] text-paper-faint uppercase">
            {total} {total === 1 ? 'memory' : 'memories'} in the archive
          </p>
        )}
      </header>

      <div className="space-y-16 sm:space-y-24">
        <BrowseSection title="New this week" kicker="Fresh from the family">
          {newThisWeek.length > 0 ? (
            <Shelf title="New this week" items={newThisWeek} hideHeading />
          ) : (
            <EmptyBrowseSection>
              A quiet week so far. The next photo or video added by the family will appear
              here.
            </EmptyBrowseSection>
          )}
        </BrowseSection>

        <BrowseSection title="People" kicker="The cast">
          {people.length > 0 ? (
            <CollectionShelf>
              {people.map((person) => (
                <CollectionCard
                  key={person.id}
                  href={`/collection/person/${person.id}`}
                  label={person.name}
                  count={person.media_count}
                  cover={covers.people.get(person.id)}
                  fallback={person.name.charAt(0)}
                />
              ))}
            </CollectionShelf>
          ) : (
            <EmptyBrowseSection>
              Tag someone in a memory and their collection will begin here.
            </EmptyBrowseSection>
          )}
        </BrowseSection>

        <BrowseSection title="Events" kicker="Days worth returning to">
          {events.length > 0 ? (
            <CollectionShelf>
              {events.map((event) => (
                <CollectionCard
                  key={event.id}
                  href={`/collection/event/${event.id}`}
                  label={event.name}
                  count={event.media_count}
                  cover={covers.events.get(event.id)}
                  fallback={event.name.charAt(0)}
                  detail={event.event_date ? fullDate(event.event_date) : undefined}
                />
              ))}
            </CollectionShelf>
          ) : (
            <EmptyBrowseSection>
              Events created by the family will become film-like collections here.
            </EmptyBrowseSection>
          )}
        </BrowseSection>

        <BrowseSection title="Years" kicker="The long view">
          {years.length > 0 ? (
            <CollectionShelf>
              {years.map((entry) => (
                <CollectionCard
                  key={entry.year}
                  href={`/collection/year/${entry.year}`}
                  label={String(entry.year)}
                  count={entry.count}
                  cover={covers.years.get(entry.year)}
                  fallback={String(entry.year)}
                />
              ))}
            </CollectionShelf>
          ) : (
            <EmptyBrowseSection>
              The archive&rsquo;s timeline begins with its first memory.
            </EmptyBrowseSection>
          )}
        </BrowseSection>

        <BrowseSection title="Favorites" kicker="The ones we keep close">
          {favorites.length > 0 ? (
            <Shelf title="Favorites" items={favorites} hideHeading />
          ) : (
            <EmptyBrowseSection>
              Memories marked with a star will gather here without changing where they
              belong in the archive.
            </EmptyBrowseSection>
          )}
        </BrowseSection>
      </div>
    </Shell>
  )
}

function BrowseSection({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`browse-${title.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="mb-6 flex items-end justify-between gap-6 border-b border-edge pb-5 sm:mb-8">
        <div>
          <p className="eyebrow mb-2">{kicker}</p>
          <h2
            id={`browse-${title.toLowerCase().replaceAll(' ', '-')}`}
            className="font-display text-[clamp(2.35rem,6vw,3.8rem)] leading-none"
          >
            {title}
          </h2>
        </div>
        <span className="hidden text-xs tracking-[0.18em] text-paper-faint uppercase sm:block">
          Scroll to explore
        </span>
      </div>
      {children}
    </section>
  )
}

function CollectionShelf({ children }: { children: React.ReactNode }) {
  return <div className="collection-shelf">{children}</div>
}

function CollectionCard({
  href,
  label,
  count,
  cover,
  fallback,
  detail,
}: {
  href: string
  label: string
  count: number
  cover?: MediaView
  fallback: string
  detail?: string
}) {
  const source = cover?.thumb_url ?? cover?.display_url

  return (
    <Link
      href={href}
      className="collection-cover group"
      aria-label={`${label}, ${count} ${count === 1 ? 'memory' : 'memories'}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.35rem] bg-ink-raised ring-1 ring-edge ring-inset">
        {source ? (
          <img
            src={source}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.035] group-hover:saturate-[1.08]"
          />
        ) : (
          <div className="collection-fallback" aria-hidden="true">
            <span>{fallback}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/5 to-transparent" />
        {cover?.type === 'video' && (
          <span className="absolute top-4 left-4 rounded-full border border-white/10 bg-ink/70 px-3 py-1 text-[10px] tracking-[0.16em] text-paper-soft uppercase backdrop-blur">
            Film
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <h3 className="font-display text-[clamp(1.85rem,5vw,2.5rem)] leading-[0.95] text-balance transition-colors group-hover:text-ember-soft">
            {label}
          </h3>
          <p className="mt-2 text-xs text-paper-soft">
            {count} {count === 1 ? 'memory' : 'memories'}
            {detail && <span className="text-paper-dim"> · {detail}</span>}
          </p>
        </div>
      </div>
    </Link>
  )
}

function EmptyBrowseSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-edge-strong bg-ink-raised/40 px-6 py-8 sm:px-8">
      <p className="max-w-lg leading-relaxed text-paper-dim">{children}</p>
    </div>
  )
}
