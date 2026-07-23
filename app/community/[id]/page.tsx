import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Feed } from '@/components/Feed'
import { Reactions } from '@/components/Reactions'
import { Comments } from '@/components/Comments'
import { Avatar } from '@/components/Avatar'
import { AddMemoriesButton } from '@/components/AddMemories'
import { EventLifecycle } from '@/components/EventLifecycle'
import { Artifacts } from '@/components/Artifacts'
import { Soundtrack } from '@/components/Soundtrack'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { readDb } from '@/lib/db'
import { getCollectionById } from '@/lib/community/events'
import { getArtifacts } from '@/lib/community/artifacts'
import { getSoundtrack } from '@/lib/community/soundtrack'
import { getFeed } from '@/lib/queries'
import { fullDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * One event across its whole life. While planned it's a flyer, an intent, and
 * the talk under it — no album yet, because nothing has happened. Once completed
 * it becomes the memory: the same flyer and comments, now with the album and
 * everyone's photos. Completion never deletes the planning stage.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const { id } = await params
  const composeArtifact = (await searchParams).compose === 'artifact'
  const db = readDb()

  const event = await getCollectionById(db, id)
  if (!event) notFound()
  // A merged (soft-deleted) event forwards to the survivor.
  if (event.merged_into) redirect(`/community/${event.merged_into}`)

  const planned = event.status !== 'completed'
  const [media, artifacts, soundtrack] = await Promise.all([
    planned ? Promise.resolve([]) : getFeed(db, { eventId: id, limit: 12 }),
    getArtifacts(db, id),
    getSoundtrack(db, id),
  ])

  return (
    <Shell viewer={viewer}>
      <div className="mt-6">
        <Link
          href={planned ? '/community' : '/timeline'}
          className="text-sm text-paper-faint transition-colors hover:text-paper"
        >
          {planned ? '← The board' : '← Timeline'}
        </Link>
      </div>

      {event.flyer_url && (
        <div className="mt-5 overflow-hidden rounded-xl bg-ink-raised">
          <img src={event.flyer_url} alt="" className="max-h-[70vh] w-full object-contain" />
        </div>
      )}

      <header className="mt-7">
        <p className="meta-mono text-paper-dim">
          {planned ? (
            <>
              {event.starts_at ? `Planned for ${fullDate(event.starts_at)}` : 'Planned'}
              {event.location ? ` · ${event.location}` : ''}
            </>
          ) : (
            <>
              {event.event_date ? fullDate(event.event_date) : 'Completed'}
              {event.location ? ` · ${event.location}` : ''}
            </>
          )}
        </p>
        <h1 className="mt-2 text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-balance">
          {event.name}
        </h1>
        {event.host_name && (
          <p className="mt-3 flex items-center gap-2 text-sm text-paper-dim">
            <Avatar name={event.host_name} src={event.host_avatar_url} size={24} />
            {planned ? 'Planned by' : 'Posted by'} {event.host_name}
          </p>
        )}
        {event.description && (
          <p className="mt-5 max-w-2xl leading-relaxed whitespace-pre-wrap text-paper-soft">
            {event.description}
          </p>
        )}

        <div className="mt-6">
          <EventLifecycle eventId={event.id} status={event.status} canRevert={viewer.role === 'owner'} />
        </div>
      </header>

      <div className="mt-6">
        <Soundtrack eventId={event.id} soundtrack={soundtrack} canEdit />
      </div>

      <div className="mt-8 space-y-10 border-y border-edge py-8">
        <Reactions collectionId={event.id} />
        <Comments collectionId={event.id} />
      </div>

      {planned ? (
        <>
          <Artifacts eventId={event.id} artifacts={artifacts} canEdit planned defaultCompose={composeArtifact} />
          <p className="mt-8 rounded-xl border border-dashed border-edge px-5 py-6 text-center text-sm text-paper-dim">
            Photos and videos land here once it happens. For now, it&rsquo;s a plan — react and talk
            it through above.
          </p>
        </>
      ) : (
        <>
          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">
                Photos
                <span className="ml-2 text-sm font-normal text-paper-faint">
                  {event.media_count} {event.media_count === 1 ? 'photo' : 'photos'}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                {event.media_count > 0 && (
                  <Link href={`/movie?source=event&id=${event.id}&mode=full`} className="btn btn-ghost">
                    ▸ Movie Mode
                  </Link>
                )}
                <AddMemoriesButton variant="hero" context={{ eventId: event.id }} />
              </div>
            </div>

            <Feed
              initial={media}
              initialCursor={media.length ? media[media.length - 1].created_at : null}
              query={`event=${event.id}`}
              emptyState={
                <p className="max-w-md leading-relaxed text-paper-dim">
                  No photos here yet. Add the first with the button above — everyone
                  can keep adding to it.
                </p>
              }
            />
          </section>
          <Artifacts
            eventId={event.id}
            artifacts={artifacts}
            canEdit
            planned={false}
            defaultCompose={composeArtifact}
          />
        </>
      )}
    </Shell>
  )
}
