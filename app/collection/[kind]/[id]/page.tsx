import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Feed } from '@/components/Feed'
import { Shell } from '@/components/Shell'
import { AddMemoriesButton } from '@/components/AddMemories'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { getFeed } from '@/lib/queries'
import { readDb } from '@/lib/db'
import { fullDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

const KINDS = ['event', 'person', 'year'] as const
type Kind = (typeof KINDS)[number]

/** One filtered stream — an event, a person, or a year. */
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>
}) {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const { kind, id } = await params
  if (!KINDS.includes(kind as Kind)) notFound()

  const db = readDb()

  let title = ''
  let subtitle: string | null = null
  let query = ''

  if (kind === 'event') {
    const { data } = await db.from('events').select('name, event_date').eq('id', id).maybeSingle()
    if (!data) notFound()
    title = data.name
    subtitle = data.event_date ? fullDate(data.event_date) : null
    query = `event=${id}`
  } else if (kind === 'person') {
    const { data } = await db.from('people').select('name').eq('id', id).maybeSingle()
    if (!data) notFound()
    title = data.name
    query = `person=${id}`
  } else {
    const year = Number(id)
    if (!Number.isInteger(year)) notFound()
    title = String(year)
    query = `year=${year}`
  }

  const media = await getFeed(db, {
    limit: 12,
    eventId: kind === 'event' ? id : null,
    personId: kind === 'person' ? id : null,
    year: kind === 'year' ? Number(id) : null,
  })

  return (
    <Shell viewer={viewer}>
      <header className="mt-6 mb-14">
        <Link
          href="/browse"
          className="text-sm text-paper-faint transition-colors hover:text-paper"
        >
          ← Browse
        </Link>
        <h1 className="mt-4 text-[clamp(2.25rem,7vw,3.5rem)] font-semibold tracking-[-0.03em] leading-none text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-3 text-paper-dim">{subtitle}</p>}
      </header>

      <Feed
        initial={media}
        initialCursor={media.length ? media[media.length - 1].created_at : null}
        query={query}
        emptyState={
          <div className="py-10">
            <p className="max-w-md text-lg leading-relaxed text-paper-soft text-balance">
              Nothing filed under {title} yet.
            </p>
            <div className="mt-8">
              <AddMemoriesButton
                variant="hero"
                context={{ eventId: kind === 'event' ? id : null }}
              />
            </div>
          </div>
        }
      />
    </Shell>
  )
}
