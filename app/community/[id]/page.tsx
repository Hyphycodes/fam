import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Feed } from '@/components/Feed'
import { Reactions } from '@/components/Reactions'
import { Comments } from '@/components/Comments'
import { Avatar } from '@/components/Avatar'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { readDb } from '@/lib/db'
import { getCollectionById } from '@/lib/community/events'
import { getFeed } from '@/lib/queries'
import { fullDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

/** One event: its flyer and details, the talk under it, and its growing album. */
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const { id } = await params
  const db = readDb()

  const event = await getCollectionById(db, id)
  if (!event) notFound()

  const media = await getFeed(db, { eventId: id, limit: 12 })

  return (
    <Shell viewer={viewer}>
      <div className="mt-6">
        <Link href="/community" className="text-sm text-paper-faint transition-colors hover:text-paper">
          ← The board
        </Link>
      </div>

      {event.flyer_url && (
        <div className="mt-5 overflow-hidden rounded-xl bg-ink-raised">
          <img src={event.flyer_url} alt="" className="max-h-[60vh] w-full object-contain" />
        </div>
      )}

      <header className="mt-7">
        {event.event_date && (
          <p className="meta-mono text-paper-dim">{fullDate(event.event_date)}</p>
        )}
        <h1 className="mt-2 text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-balance">
          {event.name}
        </h1>
        {event.host_name && (
          <p className="mt-3 flex items-center gap-2 text-sm text-paper-dim">
            <Avatar name={event.host_name} src={event.host_avatar_url} size={24} />
            Posted by {event.host_name}
          </p>
        )}
        {event.description && (
          <p className="mt-5 max-w-2xl leading-relaxed whitespace-pre-wrap text-paper-soft">
            {event.description}
          </p>
        )}
      </header>

      <div className="mt-8 space-y-10 border-y border-edge py-8">
        <Reactions collectionId={event.id} />
        <Comments collectionId={event.id} />
      </div>

      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">
            The album
            <span className="ml-2 text-sm font-normal text-paper-faint">
              {event.media_count} {event.media_count === 1 ? 'photo' : 'photos'}
            </span>
          </h2>
          <AddMemoriesButton variant="hero" context={{ eventId: event.id }} />
        </div>

        <Feed
          initial={media}
          initialCursor={media.length ? media[media.length - 1].created_at : null}
          query={`event=${event.id}`}
          emptyState={
            <p className="max-w-md leading-relaxed text-paper-dim">
              No photos in this album yet. Add the first with the button above — everyone
              can keep adding to it.
            </p>
          }
        />
      </section>
    </Shell>
  )
}
