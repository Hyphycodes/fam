import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { VideoFrame } from '@/components/VideoFrame'
import { Reactions } from '@/components/Reactions'
import { Comments } from '@/components/Comments'
import { VoiceNotes } from '@/components/VoiceNotes'
import { MemoryEditor } from '@/components/MemoryEditor'
import { DownloadButton } from '@/components/DownloadButton'
import { ProcessingWatcher } from '@/components/ProcessingWatcher'
import { Avatar } from '@/components/Avatar'
import { requireViewer } from '@/lib/viewer'
import { isConfigured } from '@/lib/env'
import { getEvents, getMediaById } from '@/lib/queries'
import { reconcileProcessingVideos } from '@/lib/reconcile'
import { readDb } from '@/lib/db'
import { fileSize, fullDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const { id } = await params
  const db = readDb()

  // If this video finished transcoding after its uploader closed the tab, this
  // is the moment it gets marked ready.
  await reconcileProcessingVideos()

  const [media, events] = await Promise.all([getMediaById(db, id), getEvents(db)])
  if (!media) notFound()

  const mine =
    viewer.kind === 'member'
      ? media.uploader_member === viewer.memberId
      : media.uploader_id === viewer.id
  const canDelete = mine || viewer.role === 'owner'

  return (
    <Shell viewer={viewer}>
      <article className="mt-6">
        {/* Refreshes this page the moment Cloudflare finishes the transcode. */}
        {media.status === 'processing' && <ProcessingWatcher mediaId={media.id} />}

        <div className="overflow-hidden rounded-2xl bg-ink-raised">
          {media.status === 'processing' ? (
            <Processing />
          ) : media.status === 'error' ? (
            <Broken reason={media.error_reason} />
          ) : media.type === 'video' && media.iframe_url ? (
            <div className="aspect-video w-full bg-black">
              <VideoFrame src={media.iframe_url} poster={media.display_url} />
            </div>
          ) : media.display_url ? (
            <img
              src={media.display_url}
              width={media.width ?? undefined}
              height={media.height ?? undefined}
              alt={
                media.caption ||
                `${media.type === 'video' ? 'Video' : 'Photo'} shared by ${media.uploader_name}`
              }
              className="max-h-[78vh] w-full object-contain animate-fade"
            />
          ) : null}
        </div>

        <header className="mt-8">
          {media.caption && (
            <h1 className="font-display text-title leading-tight text-balance">
              {media.caption}
            </h1>
          )}
          <div className={`flex flex-wrap items-center gap-x-1.5 text-paper-dim ${media.caption ? 'mt-3' : ''}`}>
            <Avatar name={media.uploader_name} src={media.uploader_avatar_url} size={24} />
            <span className="text-paper-soft">{media.uploader_name}</span>
            <span className="text-paper-faint">·</span>
            {fullDate(media.taken_at)}
            {media.event_name && media.event_id && (
              <>
                <span className="text-paper-faint">·</span>
                <Link
                  href={`/community/${media.event_id}`}
                  className="transition-colors hover:text-paper"
                >
                  {media.event_name}
                </Link>
              </>
            )}
          </div>

          {media.people.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {media.people.map((person) => (
                <Link
                  key={person.id}
                  href={`/collection/person/${person.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-edge py-1 pr-3 pl-1 text-sm text-paper-soft transition-colors hover:border-edge-strong hover:text-paper"
                >
                  <Avatar name={person.name} src={person.avatar_url} size={22} />
                  {person.name}
                </Link>
              ))}
            </div>
          )}
        </header>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {media.download_url && (
            <DownloadButton
              url={media.download_url}
              filename={media.download_filename}
              mimeType={media.mime_type}
              byteSize={media.byte_size}
              className="btn btn-ghost"
            >
              Download original
              {media.byte_size ? (
                <span className="text-paper-faint">· {fileSize(media.byte_size)}</span>
              ) : null}
            </DownloadButton>
          )}
        </div>

        <div className="mt-10 space-y-12 border-t border-edge pt-10">
          <Reactions mediaId={media.id} />
          {viewer.kind === 'legacy' && <VoiceNotes mediaId={media.id} />}
          <Comments mediaId={media.id} />
          <MemoryEditor media={media} events={events} canDelete={canDelete} />
        </div>
      </article>
    </Shell>
  )
}

function Processing() {
  return (
    <div className="grid aspect-video place-items-center px-8 text-center">
      <div>
        <p className="font-display text-3xl text-paper animate-breathe">
          Still coming through
        </p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-paper-dim">
          Cloudflare is converting this so it plays on every phone, laptop and TV in the
          family. Big videos can take a few minutes. It will appear on its own.
        </p>
      </div>
    </div>
  )
}

function Broken({ reason }: { reason: string | null }) {
  return (
    <div className="grid aspect-video place-items-center px-8 text-center">
      <div>
        <p className="font-display text-3xl text-paper">This one didn&rsquo;t make it</p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-paper-dim">
          {reason ?? 'The file could not be read.'} Try adding it again — if it keeps
          failing, the original may be damaged.
        </p>
      </div>
    </div>
  )
}
