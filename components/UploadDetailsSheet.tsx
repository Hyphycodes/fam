'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EventPicker } from '@/components/EventPicker'
import { PersonTagPicker, type TagChip } from '@/components/PersonTagPicker'
import { PhotoCropEditor } from '@/components/PhotoCropEditor'
import { classify, type Kind } from '@/lib/client/media-prep'
import type { UploadContext, UploadDraft, UploadDetails } from '@/lib/client/uploader'
import type { CropMetadata, EventRow } from '@/lib/types'

interface DraftItem extends UploadDraft {
  id: string
  kind: Kind
  previewUrl: string
  selected: boolean
}

type Filter = 'all' | Kind

export function UploadDetailsSheet({
  initialFiles,
  context,
  anonymous = false,
  onCancel,
  onConfirm,
}: {
  initialFiles: File[]
  context?: UploadContext
  anonymous?: boolean
  onCancel: () => void
  onConfirm: (drafts: UploadDraft[], context: UploadContext) => void
}) {
  const [items, setItems] = useState<DraftItem[]>(() => makeDrafts(initialFiles))
  const [filter, setFilter] = useState<Filter>('all')
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventId] = useState(context?.eventId ?? '')
  const [caption, setCaption] = useState('')
  const [people, setPeople] = useState<TagChip[]>([])
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [newAlbum, setNewAlbum] = useState('')
  const [creatingAlbum, setCreatingAlbum] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [cropId, setCropId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [hashing, setHashing] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addInput = useRef<HTMLInputElement>(null)
  const submitted = useRef(false)
  const latestItems = useRef(items)
  const durationRequests = useRef(new Set<string>())

  useEffect(() => {
    latestItems.current = items
  }, [items])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (anonymous) return
    let live = true
    void fetch('/api/events')
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data: { events: EventRow[] }) => {
        if (live) setEvents(data.events)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [anonymous])

  useEffect(() => {
    for (const item of items) {
      if (
        item.kind !== 'video' ||
        item.durationSeconds !== undefined ||
        durationRequests.current.has(item.id)
      ) continue
      durationRequests.current.add(item.id)
      void readVideoDuration(item.previewUrl).then((durationSeconds) => {
        setItems((current) =>
          current.map((entry) => entry.id === item.id ? { ...entry, durationSeconds } : entry),
        )
      })
    }
  }, [items])

  useEffect(() => () => {
    if (submitted.current) return
    for (const item of latestItems.current) URL.revokeObjectURL(item.previewUrl)
  }, [])

  const visible = useMemo(
    () => items.filter((item) => filter === 'all' || item.kind === filter),
    [filter, items],
  )
  const selected = items.filter((item) => item.selected)
  const selectedBytes = selected.reduce((sum, item) => sum + item.file.size, 0)
  const photos = items.filter((item) => item.kind === 'photo').length
  const videos = items.length - photos
  const preview = items.find((item) => item.id === previewId)
  const cropping = items.find((item) => item.id === cropId)

  function addFiles(files: File[]) {
    if (hashing) return
    const signatures = new Set(items.map((item) => signature(item.file)))
    const fresh: File[] = []
    let skipped = 0
    for (const file of files) {
      const key = signature(file)
      if (signatures.has(key)) {
        skipped += 1
        continue
      }
      signatures.add(key)
      fresh.push(file)
    }
    if (skipped) setDuplicateCount((count) => count + skipped)
    if (fresh.length) setItems((current) => [...current, ...makeDrafts(fresh)])
  }

  function close() {
    for (const item of items) URL.revokeObjectURL(item.previewUrl)
    onCancel()
  }

  async function createAlbum() {
    const name = newAlbum.trim()
    if (!name) return
    setCreatingAlbum(true)
    setError(null)
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind: 'album' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not create the album.')
      setEvents((current) => [payload.event as EventRow, ...current])
      setEventId(payload.event.id)
      setNewAlbum('')
    } catch (albumError) {
      setError(albumError instanceof Error ? albumError.message : 'Could not create the album.')
    } finally {
      setCreatingAlbum(false)
    }
  }

  async function submit() {
    if (selected.length === 0 || hashing) return
    setError(null)
    setHashing({ done: 0, total: selected.length })
    try {
      const drafts: UploadDraft[] = []
      for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index]
        const contentHash = await hashFile(item.file)
        drafts.push({
          file: item.file,
          previewUrl: item.previewUrl,
          crop: item.crop,
          durationSeconds: item.durationSeconds,
          contentHash,
        })
        setHashing({ done: index + 1, total: selected.length })
      }

      const details: UploadDetails = {
        caption: caption.trim() || undefined,
        people: people.length ? people.map((person) => ({ name: person.name })) : undefined,
        eventId: eventId || null,
        takenAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
        location: location.trim() || undefined,
      }
      submitted.current = true
      for (const item of items) {
        if (!item.selected) URL.revokeObjectURL(item.previewUrl)
      }
      onConfirm(drafts, { ...(context ?? {}), eventId: eventId || context?.eventId || null, details })
    } catch (hashError) {
      setError(hashError instanceof Error ? hashError.message : 'Could not prepare this batch.')
      setHashing(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-ink/98 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Review selected photos and videos"
    >
      <input
        ref={addInput}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />

      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-8 sm:px-6">
        <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-edge bg-ink/95 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">Review items</h1>
            <p className="mt-0.5 text-xs text-paper-faint">
              {items.length} items · {formatBytes(items.reduce((sum, item) => sum + item.file.size, 0))}
            </p>
          </div>
          <button type="button" onClick={close} className="text-sm text-paper-dim hover:text-paper">Cancel</button>
        </header>

        <div
          className={`mt-5 rounded-lg border border-dashed p-4 transition-colors ${dragging ? 'border-white bg-white/5' : 'border-edge-strong'}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            addFiles(Array.from(event.dataTransfer.files))
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-paper-dim">Drop photos and videos here, or add more from your device.</p>
            <button type="button" onClick={() => addInput.current?.click()} className="btn btn-ghost px-4 py-2 text-sm">Add more</button>
          </div>
        </div>

        {duplicateCount > 0 && (
          <p className="mt-3 text-xs text-paper-dim">{duplicateCount} repeated {duplicateCount === 1 ? 'file was' : 'files were'} skipped.</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-ink-raised p-1">
            {(['all', 'photo', 'video'] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-md px-3 py-2 text-xs ${filter === value ? 'bg-white text-black' : 'text-paper-dim hover:text-paper'}`}
              >
                {value === 'all' ? `All ${items.length}` : value === 'photo' ? `Photos ${photos}` : `Videos ${videos}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-paper-dim">
            <button type="button" onClick={() => {
              const ids = new Set(visible.map((item) => item.id))
              setItems((current) => current.map((item) => ids.has(item.id) ? { ...item, selected: true } : item))
            }} className="hover:text-paper">Select all</button>
            <button type="button" onClick={() => {
              const ids = new Set(visible.map((item) => item.id))
              setItems((current) => current.map((item) => ids.has(item.id) ? { ...item, selected: false } : item))
            }} className="hover:text-paper">Deselect</button>
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((item) => (
              <article key={item.id} className={`group overflow-hidden rounded-lg border bg-ink-raised ${item.selected ? 'border-white/50' : 'border-edge'}`}>
                <button type="button" onClick={() => setPreviewId(item.id)} className="relative block aspect-square w-full overflow-hidden bg-black">
                  {item.kind === 'photo' ? (
                    <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                  ) : (
                    <video src={item.previewUrl} muted preload="metadata" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-1 text-[10px] uppercase text-white/80">{item.kind}</span>
                  {item.kind === 'video' && item.durationSeconds != null && (
                    <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-1 text-[10px] text-white">{formatDuration(item.durationSeconds)}</span>
                  )}
                </button>
                <div className="p-2.5">
                  <p className="truncate text-xs text-paper-soft" title={item.file.name}>{item.file.name}</p>
                  <p className="mt-0.5 text-[10px] text-paper-faint">{formatBytes(item.file.size)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-paper-dim">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, selected: event.target.checked } : entry))}
                        className="accent-white"
                      />
                      Include
                    </label>
                    <div className="flex gap-2 text-[11px]">
                      {item.kind === 'photo' && <button type="button" onClick={() => setCropId(item.id)} className="text-paper-dim hover:text-paper">Crop</button>}
                      <button type="button" onClick={() => {
                        URL.revokeObjectURL(item.previewUrl)
                        setItems((current) => current.filter((entry) => entry.id !== item.id))
                      }} className="text-paper-faint hover:text-paper">Remove</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-8 py-10 text-center text-sm text-paper-faint">No items match this filter.</p>
        )}

        {!anonymous && items.length > 0 && (
          <section className="mt-8 border-t border-edge pt-6">
            <div className="mb-4">
              <h2 className="font-semibold">Apply to selected items</h2>
              <p className="mt-1 text-xs text-paper-faint">Every field is optional.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block text-xs text-paper-faint">Caption<textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} className="field mt-1.5 resize-none" placeholder="Add a caption" /></label>
              <div><span className="text-xs text-paper-faint">Tagged people</span><div className="mt-1.5"><PersonTagPicker value={people} onChange={setPeople} placeholder="Search or add a name" /></div></div>
              <div>
                <span className="text-xs text-paper-faint">Album or event</span>
                <div className="mt-1.5"><EventPicker events={events} value={eventId} onChange={setEventId} /></div>
                <div className="mt-2 flex gap-2">
                  <input value={newAlbum} onChange={(event) => setNewAlbum(event.target.value)} placeholder="New album name" className="field py-2 text-sm" />
                  <button type="button" onClick={() => void createAlbum()} disabled={creatingAlbum || !newAlbum.trim()} className="btn btn-ghost shrink-0 px-3 py-2 text-sm">{creatingAlbum ? 'Creating…' : 'Create'}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-paper-faint">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="field mt-1.5" /></label>
                <label className="text-xs text-paper-faint">Location<input value={location} onChange={(event) => setLocation(event.target.value)} className="field mt-1.5" placeholder="Optional" /></label>
              </div>
            </div>
          </section>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-paper-soft">{error}</p>}

        <footer className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-edge bg-ink/95 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <p className="text-xs text-paper-dim">{selected.length} selected · {formatBytes(selectedBytes)}</p>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="btn btn-ghost">Cancel</button>
            <button type="button" disabled={selected.length === 0 || Boolean(hashing)} onClick={() => void submit()} className="btn btn-primary min-w-36">
              {hashing ? `Checking ${hashing.done}/${hashing.total}` : `Add ${selected.length} ${selected.length === 1 ? 'Item' : 'Items'}`}
            </button>
          </div>
        </footer>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-black/95 p-4" role="dialog" aria-modal="true" aria-label={preview.file.name}>
          <button type="button" onClick={() => setPreviewId(null)} className="absolute top-5 right-5 text-sm text-white/70 hover:text-white">Close</button>
          {preview.kind === 'photo' ? <img src={preview.previewUrl} alt={preview.file.name} className="max-h-[85vh] max-w-full object-contain" /> : <video src={preview.previewUrl} controls autoPlay className="max-h-[85vh] max-w-full" />}
        </div>
      )}

      {cropping && (
        <PhotoCropEditor
          src={cropping.previewUrl}
          filename={cropping.file.name}
          initial={cropping.crop as CropMetadata | null}
          onCancel={() => setCropId(null)}
          onSave={(crop) => {
            setItems((current) => current.map((item) => item.id === cropping.id ? { ...item, crop } : item))
            setCropId(null)
          }}
        />
      )}

      {hashing && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 px-6 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-ink-raised p-6 text-center">
            <p className="text-lg font-semibold">Checking for duplicates</p>
            <p className="mt-2 text-sm text-paper-dim">{hashing.done} of {hashing.total} items</p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-edge">
              <div className="h-full bg-white transition-[width]" style={{ width: `${Math.max(3, hashing.done / hashing.total * 100)}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function makeDrafts(files: File[]): DraftItem[] {
  return files.map((file) => ({
    id: `${signature(file)}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind: classify(file),
    previewUrl: URL.createObjectURL(file),
    selected: true,
  }))
}

function signature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`
}

async function hashFile(file: File): Promise<string> {
  const { createSHA256 } = await import('hash-wasm')
  const hasher = await createSHA256()
  hasher.init()
  const reader = file.stream().getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    hasher.update(value)
  }
  return hasher.digest('hex')
}

function readVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    const finish = (duration: number | null) => {
      video.removeAttribute('src')
      video.load()
      resolve(duration)
    }
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => finish(null)
    video.src = url
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds))
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}
