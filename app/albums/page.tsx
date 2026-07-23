import { redirect } from 'next/navigation'
import { AlbumOrganizer, type AlbumSummary, type UnfiledMemory } from '@/components/AlbumOrganizer'
import { Shell } from '@/components/Shell'
import { isConfigured } from '@/lib/env'
import { getBrowseCovers, getEvents, getFeed } from '@/lib/queries'
import { readDb } from '@/lib/db'
import { requireViewer } from '@/lib/viewer'

export const dynamic = 'force-dynamic'

export default async function AlbumsPage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  const [albums, unfiled] = await Promise.all([
    getEvents(db),
    getFeed(db, { unfiled: true, limit: 120 }),
  ])
  const covers = await getBrowseCovers(db, { people: [], events: albums, years: [] })

  const albumSummaries: AlbumSummary[] = albums.map((album) => ({
    ...album,
    cover_url:
      covers.events.get(album.id)?.thumb_url ??
      covers.events.get(album.id)?.display_url ??
      covers.events.get(album.id)?.poster_url ??
      null,
  }))
  const unfiledMemories: UnfiledMemory[] = unfiled.map((memory) => ({
    id: memory.id,
    type: memory.type,
    caption: memory.caption,
    created_at: memory.created_at,
    thumb_url: memory.thumb_url,
    display_url: memory.display_url,
    poster_url: memory.poster_url,
  }))

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-10 sm:mt-12 sm:mb-14">
        <p className="eyebrow">Albums &amp; events</p>
        <h1 className="mt-3 max-w-3xl text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-none tracking-[-0.035em] text-balance">
          Keep the whole day together
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-paper-dim">
          Albums hold the memories. When an album is also an event, it can carry the date, collect
          family uploads, and appear on the Board.
        </p>
      </header>

      <AlbumOrganizer initialAlbums={albumSummaries} initialUnfiled={unfiledMemories} />
    </Shell>
  )
}
