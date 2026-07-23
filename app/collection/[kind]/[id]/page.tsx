import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Feed } from '@/components/Feed'
import { MediaTile, Rail } from '@/components/Rail'
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
  let person: { name: string; member_id: string | null; profile_id: string | null } | null = null

  if (kind === 'event') {
    const { data } = await db.from('events').select('name, event_date').eq('id', id).maybeSingle()
    if (!data) notFound()
    title = data.name
    subtitle = data.event_date ? fullDate(data.event_date) : null
    query = `event=${id}`
  } else if (kind === 'person') {
    const { data } = await db
      .from('people')
      .select('name, member_id, profile_id')
      .eq('id', id)
      .maybeSingle()
    if (!data) notFound()
    title = data.name
    person = data
    query = `person=${id}`
  } else {
    const year = Number(id)
    if (!Number.isInteger(year)) notFound()
    title = String(year)
    query = `year=${year}`
  }

  // Older tags may predate explicit identity links. Use a display-name bridge
  // only when it resolves to exactly one account; ambiguity is left unlinked
  // rather than attributing uploads to the wrong relative.
  if (kind === 'person' && person && (!person.member_id || !person.profile_id)) {
    const [{ data: members }, { data: profiles }] = await Promise.all([
      person.member_id
        ? Promise.resolve({ data: [] })
        : db.from('members').select('id').ilike('display_name', person.name).limit(2),
      person.profile_id
        ? Promise.resolve({ data: [] })
        : db.from('profiles').select('id').ilike('display_name', person.name).limit(2),
    ])
    person = {
      ...person,
      member_id: person.member_id ?? (members?.length === 1 ? members[0].id : null),
      profile_id: person.profile_id ?? (profiles?.length === 1 ? profiles[0].id : null),
    }
  }

  const [media, addedBy] = await Promise.all([
    getFeed(db, {
      limit: kind === 'person' ? 60 : 12,
      eventId: kind === 'event' ? id : null,
      personId: kind === 'person' ? id : null,
      year: kind === 'year' ? Number(id) : null,
    }),
    kind === 'person' && person && (person.member_id || person.profile_id)
      ? Promise.all([
          person.member_id
            ? getFeed(db, { limit: 60, uploaderMemberId: person.member_id })
            : Promise.resolve([]),
          person.profile_id
            ? getFeed(db, { limit: 60, uploaderId: person.profile_id })
            : Promise.resolve([]),
        ]).then((groups) => {
          const byId = new Map(groups.flat().map((item) => [item.id, item]))
          return [...byId.values()]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 60)
        })
      : Promise.resolve([]),
  ])

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

      {kind === 'person' ? (
        <div className="flex flex-col gap-12">
          {media.length > 0 && (
            <Rail title={`Featuring ${title}`}>
              {media.map((item) => (
                <MediaTile key={item.id} media={item} />
              ))}
            </Rail>
          )}
          {addedBy.length > 0 && (
            <Rail title={`Added by ${title}`}>
              {addedBy.map((item) => (
                <MediaTile key={item.id} media={item} />
              ))}
            </Rail>
          )}
          {media.length === 0 && addedBy.length === 0 && (
            <p className="py-10 text-paper-dim">No items for {title} yet.</p>
          )}
        </div>
      ) : (
        <Feed
          initial={media}
          initialCursor={media.length ? media[media.length - 1].created_at : null}
          query={query}
          emptyState={
            <div className="py-10">
              <p className="max-w-md text-lg leading-relaxed text-paper-soft text-balance">
                No items here yet.
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
      )}
    </Shell>
  )
}
