import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { CoverTile, MediaTile, Rail } from '@/components/Rail'
import { Shell } from '@/components/Shell'
import { requireViewer } from '@/lib/viewer'
import { fullDate } from '@/lib/format'
import { isConfigured } from '@/lib/env'
import { getBrowseCovers, getEvents, getFeed, getPeople, getYears } from '@/lib/queries'
import { readDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function BrowsePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  const [recent, favorites, people, allEvents, years] = await Promise.all([
    getFeed(db, { limit: 24 }),
    getFeed(db, { favorite: true, limit: 36 }),
    getPeople(db),
    getEvents(db),
    getYears(db),
  ])
  const events = allEvents.filter((event) => event.media_count > 0)
  const covers = await getBrowseCovers(db, { people: [], events, years })
  const recentIds = new Set(recent.map((item) => item.id))
  const favoriteItems = favorites.filter((item) => !recentIds.has(item.id))
  const total = years.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-10 sm:mt-12 sm:mb-14">
        <p className="eyebrow">Browse</p>
        <h1 className="mt-3 text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-none tracking-[-0.035em]">
          Find photos and videos
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper-dim">
          Browse by person, album, year, or favorite status.
        </p>
        {total > 0 && <p className="meta-mono mt-4">{total} {total === 1 ? 'item' : 'items'}</p>}
      </header>

      <div className="flex flex-col gap-11 sm:gap-14">
        {recent.length > 0 && (
          <Rail title="Recently added">
            {recent.map((item) => <MediaTile key={item.id} media={item} />)}
          </Rail>
        )}

        {people.length > 0 && (
          <section aria-labelledby="browse-people">
            <h2 id="browse-people" className="mb-3 text-lg font-semibold tracking-[-0.015em]">People</h2>
            <div className="rail">
              {people.map((person) => (
                <Link
                  key={person.id}
                  href={`/collection/person/${person.id}`}
                  className="flex w-[11rem] items-center gap-3 rounded-lg bg-ink-raised px-3 py-3 ring-1 ring-edge ring-inset transition-colors hover:bg-ink-high"
                >
                  <Avatar name={person.name} src={null} size={38} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-paper-soft">{person.name}</span>
                    <span className="meta-mono mt-0.5 block">{person.media_count} {person.media_count === 1 ? 'item' : 'items'}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {events.length > 0 && (
          <Rail title="Albums and events">
            {events.map((event) => (
              <CoverTile
                key={event.id}
                href={`/collection/event/${event.id}`}
                label={event.name}
                sublabel={event.event_date ? fullDate(event.event_date) : `${event.media_count} items`}
                cover={covers.events.get(event.id)}
              />
            ))}
          </Rail>
        )}

        {years.length > 0 && (
          <Rail title="Years">
            {years.map((entry) => (
              <CoverTile
                key={entry.year}
                href={`/collection/year/${entry.year}`}
                label={String(entry.year)}
                sublabel={`${entry.count} ${entry.count === 1 ? 'item' : 'items'}`}
                cover={covers.years.get(entry.year)}
              />
            ))}
          </Rail>
        )}

        {favoriteItems.length > 0 && (
          <Rail title="Favorites">
            {favoriteItems.map((item) => <MediaTile key={item.id} media={item} />)}
          </Rail>
        )}
      </div>
    </Shell>
  )
}
