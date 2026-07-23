import { redirect } from 'next/navigation'
import { MovieMode, type Flavor } from '@/components/MovieMode'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { getEvents, getFeed, getPeople, getYears } from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { readDb } from '@/lib/db'
import type { DB } from '@/lib/api'
import type { MediaView } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * One player, one route. With no params it's the browse-and-pick start screen
 * (unchanged). With `?source=…&mode=…` it's a deep link — playMovie realised as
 * a URL — that fetches just that source and starts immediately. Event, album,
 * year, and archive all flow through the same component and the same builder.
 */
export default async function MoviePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if (!isConfigured('supabase')) redirect('/setup')
  await requireViewer()
  await reconcileProcessingVideos()

  const db = readDb()
  const params = await searchParams
  const source = params.source
  const mode = params.mode === 'full' ? 'full' : 'shuffle'
  const id = params.id
  const year = Number(params.year) || null

  if (source) {
    let media: MediaView[] = []
    let sourceLabel = 'Everything'
    if (source === 'archive') {
      media = await getFeed(db, { limit: 400, order: 'taken' })
      sourceLabel = 'Family TV'
    } else if ((source === 'event' || source === 'album') && id) {
      media = await getFeed(db, { eventId: id, limit: 400, order: 'taken' })
      sourceLabel = media[0]?.event_name ?? (source === 'album' ? 'This album' : 'This event')
    } else if (source === 'year' && year) {
      media = await getFeed(db, { year, limit: 400, order: 'taken' })
      sourceLabel = String(year)
    }

    return (
      <MovieMode
        flavors={await buildFlavors(db)}
        initialMedia={media}
        autoStart
        initialMode={mode}
        sourceLabel={sourceLabel}
      />
    )
  }

  const [media, flavors] = await Promise.all([
    getFeed(db, { limit: 400, order: 'taken' }),
    buildFlavors(db),
  ])
  return <MovieMode flavors={flavors} initialMedia={media} />
}

/** The in-player flavour picker's options — only ones that would play something. */
async function buildFlavors(db: DB): Promise<Flavor[]> {
  const [events, people, years] = await Promise.all([getEvents(db), getPeople(db), getYears(db)])
  return [
    { kind: 'everything', label: 'Everything' },
    { kind: 'funny', label: 'Funny stuff' },
    ...people
      .filter((person) => person.media_count > 0)
      .slice(0, 8)
      .map((person): Flavor => ({ kind: 'person', id: person.id, label: person.name })),
    ...events
      .filter((event) => event.media_count > 0)
      .slice(0, 8)
      .map((event): Flavor => ({ kind: 'event', id: event.id, label: event.name })),
    ...years
      .slice(0, 10)
      .map((entry): Flavor => ({ kind: 'year', year: entry.year, label: String(entry.year) })),
  ]
}
