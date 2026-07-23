import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Timeline } from '@/components/Timeline'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { readDb } from '@/lib/db'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import {
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
 */
export default async function TimelinePage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  await reconcileProcessingVideos()

  const [counts, page, people, events, artifacts] = await Promise.all([
    getTimelineMonthCounts(db),
    getTimelinePage(db, { limit: 60 }),
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
        people={people
          .filter((person) => person.media_count > 0)
          .map((person) => ({ id: person.id, name: person.name }))}
      />
    </Shell>
  )
}
