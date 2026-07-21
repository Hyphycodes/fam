'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { UploadQueue, type UploadContext, type UploadItem } from '@/lib/client/uploader'

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

  const pick = useCallback(() => {
    queue.setContext(context ?? {})
    input.current?.click()
  }, [context])

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
          if (files.length) queue.add(files)
          // Reset so picking the same file twice still fires a change event.
          event.target.value = ''
        }}
      />

      {variant === 'hero' ? (
        <button onClick={pick} className="btn btn-primary px-8 py-4 text-base">
          Add memories
        </button>
      ) : (
        <button
          onClick={pick}
          aria-label="Add memories"
          className="dock-add mx-0.5 flex h-[3.65rem] w-[3.65rem] flex-col items-center justify-center gap-0.5 rounded-[1.3rem] bg-ember text-[#1a1105] shadow-[0_8px_24px_-8px_rgba(217,155,82,0.8)] transition-transform hover:scale-[1.035] active:scale-95 sm:mx-1"
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

      <UploadTray />
    </>
  )
}

function UploadTray() {
  const items = useUploads()
  const router = useRouter()
  const previouslyBusy = useRef(false)

  const busy = items.some((i) => i.status !== 'ready' && i.status !== 'error')
  const allDone = items.length > 0 && !busy
  const anyFailed = items.some((i) => i.status === 'error')

  // Refresh the feed once the last upload lands, so the new memories are simply
  // there rather than needing a manual reload.
  useEffect(() => {
    if (previouslyBusy.current && !busy && items.some((i) => i.status === 'ready')) {
      router.refresh()
    }
    previouslyBusy.current = busy
  }, [busy, items, router])

  // Tidy itself away once everything has landed. Failures stay put — they still
  // want a retry.
  useEffect(() => {
    if (busy || anyFailed || items.length === 0) return
    const timer = window.setTimeout(() => queue.clearFinished(), 3500)
    return () => window.clearTimeout(timer)
  }, [busy, anyFailed, items.length])

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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:pb-32">
      <div
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-ink-raised/95 shadow-2xl backdrop-blur-xl animate-rise"
        role="status"
        aria-live="polite"
        aria-label={busy ? `Uploading memories, ${done} of ${items.length} complete` : 'Memory upload finished'}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <p className="font-display text-xl">
            {busy
              ? 'Adding your memories…'
              : allDone && done === items.length
                ? 'All in.'
                : 'Finished'}
          </p>
          <button
            onClick={() => queue.clearFinished({ includeErrors: !busy })}
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            {busy ? `${done}/${items.length}` : 'Done'}
          </button>
        </div>

        <ul className="max-h-72 space-y-1 overflow-y-auto px-3 pb-3">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function UploadRow({ item }: { item: UploadItem }) {
  const percent = Math.round(item.progress * 100)

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-high">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full animate-sweep" />
        )}
        {item.status === 'ready' && (
          <div className="absolute inset-0 grid place-items-center bg-ink/55 text-ember">✓</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-paper-soft">{item.file.name}</p>
        <p className="text-xs text-paper-dim">
          {item.status === 'error' ? (
            <span className="text-ember-soft">{item.error}</span>
          ) : item.status === 'preparing' ? (
            'Getting it ready…'
          ) : item.status === 'uploading' ? (
            `${percent}%`
          ) : item.status === 'processing' ? (
            <span className="animate-breathe">
              Cloudflare is making this play everywhere…
            </span>
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
