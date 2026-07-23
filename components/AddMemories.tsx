'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UploadQueue, type UploadContext, type UploadItem } from '@/lib/client/uploader'
import { UploadDetailsSheet } from '@/components/UploadDetailsSheet'

/**
 * "Add memories".
 *
 * One tap opens the phone's own picker — no intermediate screen explaining what
 * a file is. Everything after that happens in a tray at the bottom, so you can
 * keep scrolling the feed while a video uploads.
 */

// Module-level so an in-flight upload survives navigating between pages.
const queue = new UploadQueue()
let snapshot: UploadItem[] = []
queue.subscribe((items) => {
  snapshot = items
})

function useUploads(): UploadItem[] {
  return useSyncExternalStore(
    (onChange) => queue.subscribe(() => onChange()),
    () => snapshot,
    () => snapshot,
  )
}

export function AddMemoriesButton({
  context,
  variant = 'nav',
}: {
  context?: UploadContext
  variant?: 'nav' | 'hero'
}) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[] | null>(null)
  const anonymous = Boolean(context?.linkToken)

  const pick = useCallback(() => {
    input.current?.click()
  }, [])

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        // No `capture` — that would force the camera and hide the library,
        // which is where the memories actually are.
        accept="image/*,video/*"
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length === 0) return
          setPending(files)
        }}
      />

      {pending && (
        <UploadDetailsSheet
          initialFiles={pending}
          context={context}
          anonymous={anonymous}
          onCancel={() => setPending(null)}
          onConfirm={(drafts, uploadContext) => {
            queue.add(drafts, uploadContext)
            setPending(null)
          }}
        />
      )}

      {variant === 'hero' ? (
        <button onClick={pick} className="btn btn-primary px-8 py-4 text-base">
          Add items
        </button>
      ) : (
        <button
          onClick={pick}
          aria-label="Add photos or videos"
          className="dock-add mx-0.5 flex h-[3.65rem] w-[3.65rem] flex-col items-center justify-center gap-0.5 rounded-full bg-white text-ink shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9)] transition-transform hover:scale-[1.035] active:scale-95 sm:mx-1"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-[10px] font-medium">Add</span>
        </button>
      )}

      {(variant === 'nav' || anonymous) && <UploadTray />}
    </>
  )
}

function UploadTray() {
  const items = useUploads()
  const router = useRouter()
  const previouslyBusy = useRef(false)

  const busy = items.some((i) => !['ready', 'duplicate', 'error'].includes(i.status))
  const anyFailed = items.some((i) => i.status === 'error')

  // Refresh the feed once the last upload lands, so the new memories are simply
  // there rather than needing a manual reload.
  useEffect(() => {
    if (previouslyBusy.current && !busy && items.some((i) => i.status === 'ready')) {
      router.refresh()
    }
    previouslyBusy.current = busy
  }, [busy, items, router])

  // Warn before closing the tab mid-upload — losing a 2GB video to a stray
  // Cmd-W is a genuinely bad afternoon.
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  if (items.length === 0) return null

  const done = items.filter((i) => i.status === 'ready').length
  const failed = items.filter((i) => i.status === 'error').length
  const duplicates = items.filter((i) => i.status === 'duplicate').length
  const photos = items.filter((i) => i.kind === 'photo' && i.status === 'ready').length
  const videos = items.filter((i) => i.kind === 'video' && i.status === 'ready').length
  const overall = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length * 100)
    : 0
  const albumId = items.find((item) => item.context.details?.eventId)?.context.details?.eventId

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:pb-32">
      <div
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-ink-raised/95 shadow-2xl backdrop-blur-xl animate-rise"
        role="status"
        aria-live="polite"
        aria-label={busy ? `Uploading items, ${done} of ${items.length} complete` : 'Upload finished'}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
          <p className="text-lg font-semibold">
            {busy
              ? `Uploading ${items.length} ${items.length === 1 ? 'item' : 'items'}`
              : `${done} ${done === 1 ? 'item' : 'items'} added`}
          </p>
          <p className="mt-0.5 text-xs text-paper-faint">
            {busy ? `${overall}% overall` : `${photos} photos · ${videos} videos${failed ? ` · ${failed} failed` : ''}${duplicates ? ` · ${duplicates} already added` : ''}`}
          </p>
          </div>
          {busy ? (
            <span className="text-sm text-paper-dim">{done}/{items.length}</span>
          ) : (
            <button
              onClick={() => queue.clearFinished({ includeErrors: true })}
              className="text-sm text-paper-dim transition-colors hover:text-paper"
            >
              Close
            </button>
          )}
        </div>

        <ul className="max-h-72 space-y-1 overflow-y-auto px-3 pb-3">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} />
          ))}
        </ul>
        {!busy && (
          <div className="flex flex-wrap gap-2 border-t border-edge px-5 py-3">
            <Link href="/you" className="btn btn-ghost px-3 py-2 text-xs">View uploads</Link>
            {albumId && <Link href={`/collection/event/${albumId}`} className="btn btn-ghost px-3 py-2 text-xs">Open album</Link>}
            {anyFailed && <button type="button" onClick={() => items.filter((item) => item.status === 'error').forEach((item) => queue.retry(item.id))} className="btn btn-primary px-3 py-2 text-xs">Retry failed</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function UploadRow({ item }: { item: UploadItem }) {
  const percent = Math.round(item.progress * 100)

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-high">
        {item.previewUrl && item.kind === 'video' ? (
          <video src={item.previewUrl} muted preload="metadata" className="h-full w-full object-cover" />
        ) : item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full animate-sweep" />
        )}
        {item.status === 'ready' && (
          <div className="absolute inset-0 grid place-items-center bg-ink/55 text-white">✓</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-paper-soft">{item.file.name}</p>
        <p className="text-xs text-paper-dim">
          {item.status === 'error' ? (
            <span className="text-ember-soft">{item.error}</span>
          ) : item.status === 'preparing' ? (
            'Preparing'
          ) : item.status === 'uploading' ? (
            `${percent}%`
          ) : item.status === 'processing' ? (
            <span className="animate-breathe">Processing video</span>
          ) : item.status === 'duplicate' ? (
            'Already added'
          ) : (
            'Added'
          )}
        </p>

        {(item.status === 'uploading' || item.status === 'preparing') && (
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-edge">
            <div
              role="progressbar"
              aria-label={`Upload progress for ${item.file.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-full bg-ember transition-[width] duration-300"
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
        )}
      </div>

      {item.status === 'error' && (
        <button
          onClick={() => queue.retry(item.id)}
          className="shrink-0 rounded-full border border-edge-strong px-3 py-1 text-xs text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper"
        >
          Retry
        </button>
      )}
    </li>
  )
}
