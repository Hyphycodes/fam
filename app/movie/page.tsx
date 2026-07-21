import { redirect } from 'next/navigation'
import { MovieMode, type Flavor } from '@/components/MovieMode'
import { requireSession } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { getEvents, getFeed, getPeople, getYears } from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function MoviePage() {
  if (!isConfigured('supabase')) redirect('/setup')
  await requireSession()

  await reconcileProcessingVideos()

  const db = await createClient()
  const [media, events, people, years] = await Promise.all([
    getFeed(db, { limit: 400, order: 'taken' }),
    getEvents(db),
    getPeople(db),
    getYears(db),
  ])

  // Only offer a flavour that would actually play something.
  const flavors: Flavor[] = [
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

  return <MovieMode flavors={flavors} initialMedia={media} />
}
