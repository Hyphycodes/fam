import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Timeline } from '@/components/Timeline'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { readDb } from '@/lib/db'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import {
  cursorForYearEnd,
  getTimelineArtifacts,
  getTimelineEvents,
  getTimelineMonthCounts,
  getTimelinePage,
} from '@/lib/timeline'
import { getPeople } from '@/lib/queries'

export const dynamic = 'force-dynamic'

/**
 * The Timeline — one continuous, scrollable history ordered by capture date,
 * mixing every content type. The backbone the product is named after.
 *
 * Deep links: `?year=2006` starts the scroll at that year (Home's "jump back
 * in"); `?type=photo|video` opens with that filter (Home's Collections).
 */
export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  await reconcileProcessingVideos()

  const params = await searchParams
  const year = Number(params.year) || null
  const type = params.type === 'photo' || params.type === 'video' ? params.type : null

  const [counts, page, people, events, artifacts] = await Promise.all([
    getTimelineMonthCounts(db),
    getTimelinePage(db, { limit: 60, cursor: year ? cursorForYearEnd(year) : null, type }),
    getPeople(db),
    getTimelineEvents(db),
    getTimelineArtifacts(db),
  ])

  return (
    <Shell viewer={viewer}>
      <Timeline
        initialMedia={page.media}
        initialCursor={page.nextCursor}
        monthCounts={counts}
        events={events}
        artifacts={artifacts}
        initialType={type}
        people={people
          .filter((person) => person.media_count > 0)
          .map((person) => ({ id: person.id, name: person.name }))}
      />
    </Shell>
  )
}
