'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { UploadQueue, type UploadContext, type UploadItem } from '@/lib/client/uploader'
import { UploadDetailsSheet } from '@/components/UploadDetailsSheet'
import { loadRecoveryRecords, type UploadRecoveryRecord } from '@/lib/client/upload-recovery'
import { boundedOverallProgress } from '@/lib/client/upload-logic'

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
let recoverySnapshot: UploadRecoveryRecord[] = []
let recoveryLoad: Promise<UploadRecoveryRecord[]> | null = null
let recoveryRestored = false
queue.subscribe((items) => {
  snapshot = items
})

async function restoreRecoveryQueue() {
  if (!recoveryLoad) recoveryLoad = loadRecoveryRecords()
  const records = await recoveryLoad
  if (!recoveryRestored) {
    recoverySnapshot = queue.restore(records)
    recoveryRestored = true
  }
  return recoverySnapshot
}

function useUploads(): UploadItem[] {
  return useSyncExternalStore(
    (onChange) => queue.subscribe(() => onChange()),
    () => snapshot,
    () => snapshot,
  )
}

/** The board-event or event-collection id the viewer is currently inside, so a
 *  tap on (+) can pre-select it as the destination. */
function eventIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null
  const uuid = '([0-9a-fA-F-]{36})'
  return (
    pathname.match(new RegExp(`^/community/${uuid}`))?.[1] ??
    pathname.match(new RegExp(`^/collection/event/${uuid}`))?.[1] ??
    null
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const pathname = usePathname()

  // Inside an event, that event becomes the upload (and artifact) destination.
  const currentEventId = eventIdFromPath(pathname)
  const uploadContext = context ?? (currentEventId ? { eventId: currentEventId } : undefined)
  const anonymous = Boolean(uploadContext?.linkToken)

  // The (+) is a menu (photos, an event, an artifact) — but a guest link and the
  // explicit "Add items" CTAs go straight to the picker.
  const menu = variant === 'nav' && !anonymous

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
          context={uploadContext}
          anonymous={anonymous}
          onCancel={() => setPending(null)}
          onConfirm={(drafts, confirmedContext) => {
            queue.add(drafts, confirmedContext)
            setPending(null)
          }}
        />
      )}

      {sheetOpen && (
        <AddActionSheet
          eventId={currentEventId}
          onAddMedia={() => {
            setSheetOpen(false)
            pick()
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {variant === 'hero' ? (
        <button onClick={pick} className="btn btn-primary px-8 py-4 text-base">
          Add items
        </button>
      ) : (
        <button
          onClick={() => (menu ? setSheetOpen(true) : pick())}
          aria-label="Add to the archive"
          aria-haspopup={menu ? 'menu' : undefined}
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

/**
 * The (+) menu. Adding photos or videos is the default and comes first; below it
 * are the two other things that keep an archive organized instead of a loose
 * pile — planning or recording an event, and attaching an artifact (a flyer,
 * menu, screenshot, or link). Inside an event, those actions target it.
 */
function AddActionSheet({
  eventId,
  onAddMedia,
  onClose,
}: {
  eventId: string | null
  onAddMedia: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const artifactHref = eventId ? `/community/${eventId}?compose=artifact` : '/community'

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Add">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="animate-rise pointer-events-auto relative mb-[calc(6rem+env(safe-area-inset-bottom))] w-full max-w-sm px-4 sm:mb-32">
        <div className="overflow-hidden rounded-2xl border border-edge bg-ink-raised/95 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={onAddMedia}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-hover"
          >
            <SheetGlyph>
              <path d="M12 5v14M5 12h14" />
            </SheetGlyph>
            <span>
              <span className="block font-medium text-paper">Add photos or videos</span>
              <span className="block text-xs text-paper-faint">
                {eventId ? 'Straight into this event' : 'From your library'}
              </span>
            </span>
          </button>

          <Link
            href="/community?create=1"
            onClick={onClose}
            className="flex items-center gap-3 border-t border-edge px-5 py-4 transition-colors hover:bg-ink-hover"
          >
            <SheetGlyph>
              <rect x="3.75" y="4.75" width="16.5" height="15.5" rx="2" />
              <path d="M3.75 9h16.5M8 3.5v3M16 3.5v3" />
            </SheetGlyph>
            <span>
              <span className="block font-medium text-paper">Create an event</span>
              <span className="block text-xs text-paper-faint">A plan, or something that happened</span>
            </span>
          </Link>

          <Link
            href={artifactHref}
            onClick={onClose}
            className="flex items-center gap-3 border-t border-edge px-5 py-4 transition-colors hover:bg-ink-hover"
          >
            <SheetGlyph>
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9L20 9.5V18.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z" />
              <path d="M14 4v6h6" />
            </SheetGlyph>
            <span>
              <span className="block font-medium text-paper">Add an artifact</span>
              <span className="block text-xs text-paper-faint">Flyer, menu, screenshot, or link</span>
            </span>
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl border border-edge bg-ink-raised/95 py-3.5 text-center font-medium text-paper-dim backdrop-blur-xl transition-colors hover:text-paper"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function SheetGlyph({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-high text-paper">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </span>
  )
}

function UploadTray() {
  const items = useUploads()
  const router = useRouter()
  const previouslyBusy = useRef(false)
  const recoveryInput = useRef<HTMLInputElement>(null)
  const [recoveries, setRecoveries] = useState<UploadRecoveryRecord[]>(recoverySnapshot)
  const [trayPage, setTrayPage] = useState(0)
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null)

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

  useEffect(() => {
    let live = true
    void restoreRecoveryQueue().then((records) => {
      if (live) setRecoveries(records)
    })
    return () => {
      live = false
    }
  }, [])

  if (items.length === 0 && recoveries.length === 0) return null

  const done = items.filter((i) => i.status === 'ready').length
  const failed = items.filter((i) => i.status === 'error').length
  const duplicates = items.filter((i) => i.status === 'duplicate').length
  const finished = done + failed + duplicates
  const photos = items.filter((i) => i.kind === 'photo' && i.status === 'ready').length
  const videos = items.filter((i) => i.kind === 'video' && i.status === 'ready').length
  const overall = boundedOverallProgress(items)
  const albumId = items.find((item) => item.context.details?.eventId)?.context.details?.eventId
  const trayPageCount = Math.max(1, Math.ceil(items.length / 20))
  const safeTrayPage = Math.min(trayPage, trayPageCount - 1)
  const visibleItems = items.slice(safeTrayPage * 20, (safeTrayPage + 1) * 20)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:pb-32">
      <div
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-ink-raised/95 shadow-2xl backdrop-blur-xl animate-rise"
        role="status"
        aria-live="polite"
        aria-label={
          busy ? `Uploading items, ${finished} of ${items.length} complete` : 'Upload finished'
        }
      >
        <input
          ref={recoveryInput}
          type="file"
          multiple
          accept="image/*,video/*"
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (!files.length) return
            const result = queue.resume(recoveries, files)
            recoverySnapshot = result.missing
            setRecoveries(result.missing)
            setRecoveryMessage(
              result.resumed > 0
                ? `${result.resumed} ${result.resumed === 1 ? 'upload' : 'uploads'} resumed${result.missing.length ? ` · ${result.missing.length} still need files` : ''}.`
                : 'Those files did not match the interrupted uploads.',
            )
          }}
        />
        {recoveries.length > 0 && (
          <div className="border-b border-edge bg-ember/8 px-5 py-4">
            <p className="text-sm font-semibold">
              {recoveries.length} interrupted {recoveries.length === 1 ? 'upload' : 'uploads'}
            </p>
            <p className="mt-1 text-xs text-paper-dim">
              Reselect the same files to continue. Video uploads resume from their saved offset.
            </p>
            <button
              type="button"
              onClick={() => recoveryInput.current?.click()}
              className="btn btn-ghost mt-3 px-3 py-2 text-xs"
            >
              Reselect files
            </button>
            {recoveryMessage && <p className="mt-2 text-xs text-paper-dim">{recoveryMessage}</p>}
          </div>
        )}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <p className="text-lg font-semibold">
              {items.length === 0
                ? 'Uploads interrupted'
                : busy
                  ? `Uploading ${items.length} ${items.length === 1 ? 'item' : 'items'}`
                  : `${done} ${done === 1 ? 'item' : 'items'} added`}
            </p>
            <p className="mt-0.5 text-xs text-paper-faint">
              {items.length === 0
                ? 'Reselect the original files to continue.'
                : busy
                  ? `${overall}% overall`
                  : `${photos} photos · ${videos} videos${failed ? ` · ${failed} failed` : ''}${duplicates ? ` · ${duplicates} already added` : ''}`}
            </p>
          </div>
          {busy ? (
            <span className="text-sm text-paper-dim">
              {finished}/{items.length}
            </span>
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
          {visibleItems.map((item) => (
            <UploadRow key={item.id} item={item} />
          ))}
        </ul>
        {items.length > 20 && (
          <div className="mx-5 mb-3 flex items-center justify-between text-xs text-paper-dim">
            <button
              type="button"
              onClick={() => setTrayPage((current) => Math.max(0, current - 1))}
              disabled={safeTrayPage === 0}
              className="hover:text-paper disabled:opacity-35"
            >
              Previous
            </button>
            <span>
              {safeTrayPage + 1} of {trayPageCount}
            </span>
            <button
              type="button"
              onClick={() => setTrayPage((current) => Math.min(trayPageCount - 1, current + 1))}
              disabled={safeTrayPage >= trayPageCount - 1}
              className="hover:text-paper disabled:opacity-35"
            >
              Next
            </button>
          </div>
        )}
        {!busy && (
          <div className="flex flex-wrap gap-2 border-t border-edge px-5 py-3">
            <Link href="/you" className="btn btn-ghost px-3 py-2 text-xs">
              View uploads
            </Link>
            {albumId && (
              <Link
                href={`/collection/event/${albumId}`}
                className="btn btn-ghost px-3 py-2 text-xs"
              >
                Open album
              </Link>
            )}
            {anyFailed && (
              <button
                type="button"
                onClick={() =>
                  items
                    .filter((item) => item.status === 'error')
                    .forEach((item) => queue.retry(item.id))
                }
                className="btn btn-primary px-3 py-2 text-xs"
              >
                Retry failed
              </button>
            )}
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
        {item.kind === 'video' ? (
          <span
            className="grid h-full place-items-center text-xs text-paper-faint"
            aria-hidden="true"
          >
            ▶
          </span>
        ) : item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
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
          {item.warning ? (
            <span className="text-ember-soft">{item.warning}</span>
          ) : item.status === 'error' ? (
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
      {item.warning && item.mediaId && (
        <button
          type="button"
          onClick={() => void queue.retryDetails(item.id)}
          disabled={item.warning === 'Retrying details…'}
          className="shrink-0 rounded-full border border-edge-strong px-3 py-1 text-xs text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper disabled:opacity-50"
        >
          Retry details
        </button>
      )}
    </li>
  )
}
