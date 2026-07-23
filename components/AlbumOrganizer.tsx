'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { latestUploadBatch } from '@/lib/client/albums'
import { fullDate } from '@/lib/format'
import { CaptureDateFields, type CaptureDateValue } from '@/components/CaptureDateFields'
import type { CollectionKind, EventRow } from '@/lib/types'

const ORGANIZER_PAGE_SIZE = 60

export interface AlbumSummary extends EventRow {
  media_count: number
  cover_url: string | null
}

export interface UnfiledMemory {
  id: string
  type: 'photo' | 'video'
  caption: string | null
  created_at: string
  thumb_url: string | null
  display_url: string | null
  poster_url: string | null
}

export function AlbumOrganizer({
  initialAlbums,
  initialUnfiled,
}: {
  initialAlbums: AlbumSummary[]
  initialUnfiled: UnfiledMemory[]
}) {
  const router = useRouter()
  const [albums, setAlbums] = useState(initialAlbums)
  const [unfiled, setUnfiled] = useState(initialUnfiled)
  const [selected, setSelected] = useState<string[]>([])
  const [albumId, setAlbumId] = useState(initialAlbums[0]?.id ?? '')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<CollectionKind>('album')
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [datingOpen, setDatingOpen] = useState(false)
  const [dating, setDating] = useState(false)
  const [bulkCapture, setBulkCapture] = useState<CaptureDateValue>({ precision: 'day', takenAt: null })
  const [page, setPage] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allSelected = unfiled.length > 0 && selected.length === unfiled.length
  const latestBatch = useMemo(() => latestUploadBatch(unfiled), [unfiled])
  const latestBatchSelected =
    latestBatch.length > 0 && latestBatch.every((memory) => selectedSet.has(memory.id))
  const albumsOnly = albums.filter((album) => album.kind === 'album')
  const eventAlbums = albums.filter((album) => album.kind === 'event')
  const pageCount = Math.max(1, Math.ceil(unfiled.length / ORGANIZER_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visibleUnfiled = unfiled.slice(
    safePage * ORGANIZER_PAGE_SIZE,
    (safePage + 1) * ORGANIZER_PAGE_SIZE,
  )

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
    setMessage(null)
  }

  async function createAlbum() {
    const title = name.trim()
    if (!title || creating) return
    setCreating(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title, eventDate: date || null, kind }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not create that album.')

      const returned = payload.event as EventRow
      const created =
        albums.find((album) => album.id === returned.id) ??
        ({
          ...returned,
          media_count: 0,
          cover_url: null,
        } satisfies AlbumSummary)
      setAlbums((current) => {
        const without = current.filter((album) => album.id !== created.id)
        return [created, ...without]
      })
      setAlbumId(created.id)
      setName('')
      setDate('')
      setMessage(`${created.name} is ready.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create that album.')
    } finally {
      setCreating(false)
    }
  }

  async function assignSelected() {
    if (!albumId || selected.length === 0 || assigning) return
    setAssigning(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/albums/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId, mediaIds: selected }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not file those memories.')

      const assignedIds = new Set<string>(payload.mediaIds ?? [])
      const assigned = Number(payload.assigned ?? 0)
      const albumName = albums.find((album) => album.id === albumId)?.name ?? 'the album'
      setUnfiled((current) => current.filter((memory) => !assignedIds.has(memory.id)))
      setAlbums((current) =>
        current.map((album) =>
          album.id === albumId ? { ...album, media_count: album.media_count + assigned } : album,
        ),
      )
      setSelected([])
      setPage(0)
      setMessage(`${assigned} ${assigned === 1 ? 'memory' : 'memories'} added to ${albumName}.`)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not file those memories.')
    } finally {
      setAssigning(false)
    }
  }

  async function applyDates() {
    if (selected.length === 0 || dating) return
    if (!bulkCapture.takenAt) {
      setError('Pick a date first.')
      return
    }
    setDating(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/media/dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selected,
          takenAt: bulkCapture.takenAt,
          precision: bulkCapture.precision,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not set those dates.')

      const updated = Number(payload.updated ?? 0)
      setDatingOpen(false)
      setSelected([])
      setMessage(`Date set on ${updated} ${updated === 1 ? 'memory' : 'memories'}.`)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set those dates.')
    } finally {
      setDating(false)
    }
  }

  return (
    <div className="flex flex-col gap-14">
      <section aria-labelledby="album-library">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">The family archive</p>
            <h2 id="album-library" className="text-2xl font-semibold tracking-[-0.02em]">
              Albums
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-paper-dim">
            Every event has an album. Event albums can also appear on the Board.
          </p>
        </div>

        {albums.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {albums.map((album) => (
              <Link
                key={album.id}
                href={`/collection/event/${album.id}`}
                className="group overflow-hidden rounded-xl border border-edge bg-ink-raised transition-colors hover:bg-ink-high"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-ink-high">
                  {album.cover_url ? (
                    <img
                      src={album.cover_url}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_45%),linear-gradient(145deg,rgba(255,255,255,0.04),transparent)]" />
                  )}
                  <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] tracking-[0.14em] text-white/75 uppercase backdrop-blur">
                    {album.kind === 'event' ? 'Event album' : 'Album'}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="truncate font-display text-xl text-paper">{album.name}</p>
                  <p className="meta-mono mt-1">
                    {album.event_date
                      ? `${fullDate(album.event_date)} · ${album.media_count} ${album.media_count === 1 ? 'item' : 'items'}`
                      : `${album.media_count} ${album.media_count === 1 ? 'item' : 'items'}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-edge px-5 py-10 text-paper-dim">
            No albums yet. Make the first one below.
          </p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-2xl border border-edge bg-ink-raised p-5 sm:p-6">
          <p className="eyebrow mb-2">New collection</p>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Make an album</h2>
          <p className="mt-2 text-sm leading-relaxed text-paper-dim">
            Keep it as an album, or make it an event album so it can live on the Board too.
          </p>

          <div className="mt-6 space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Father’s Day 2023"
              className="field"
              aria-label="Album name"
            />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field"
              aria-label="Album date"
            />
            <div className="grid grid-cols-2 gap-2" aria-label="Album visibility">
              <button
                type="button"
                onClick={() => setKind('album')}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                  kind === 'album'
                    ? 'border-paper/40 bg-white/8 text-paper'
                    : 'border-edge text-paper-dim hover:bg-ink-high'
                }`}
              >
                <span className="block font-medium">Album</span>
                <span className="mt-1 block text-xs text-paper-faint">Archive only</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('event')}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                  kind === 'event'
                    ? 'border-paper/40 bg-white/8 text-paper'
                    : 'border-edge text-paper-dim hover:bg-ink-high'
                }`}
              >
                <span className="block font-medium">Event album</span>
                <span className="mt-1 block text-xs text-paper-faint">Can show on Board</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => void createAlbum()}
              disabled={creating || !name.trim()}
              className="btn btn-primary w-full"
            >
              {creating ? 'Creating…' : 'Create album'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-ink-raised p-5 sm:p-6">
          <p className="eyebrow mb-2">Organize later</p>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">File recent uploads</h2>
          <p className="mt-2 text-sm leading-relaxed text-paper-dim">
            Select a whole batch—like the 45 memories you just added—and place it into one album.
          </p>

          {unfiled.length > 0 ? (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(latestBatchSelected ? [] : latestBatch.map((memory) => memory.id))
                  }
                  className="btn btn-primary"
                >
                  {latestBatchSelected
                    ? 'Clear latest batch'
                    : `Select latest batch (${latestBatch.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? [] : unfiled.map((memory) => memory.id))}
                  className="btn btn-ghost"
                >
                  {allSelected ? 'Clear selection' : `Select all ${unfiled.length}`}
                </button>
                <button
                  type="button"
                  onClick={() => setDatingOpen((open) => !open)}
                  disabled={selected.length === 0}
                  className="btn btn-ghost disabled:opacity-40"
                >
                  {datingOpen ? 'Close date' : 'Set date'}
                </button>
                <span className="text-sm text-paper-dim">{selected.length} selected</span>
              </div>

              {datingOpen && selected.length > 0 && (
                <div className="mt-4 rounded-xl border border-edge bg-ink-high/50 p-4 animate-rise">
                  <p className="mb-3 text-sm text-paper-soft">
                    Set one date on all {selected.length}{' '}
                    {selected.length === 1 ? 'memory' : 'memories'} — the honest precision for a
                    box of old prints is often just the year.
                  </p>
                  <CaptureDateFields
                    initialPrecision="year"
                    onChange={setBulkCapture}
                    idPrefix="bulk"
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void applyDates()}
                      disabled={dating || !bulkCapture.takenAt}
                      className="btn btn-primary"
                    >
                      {dating ? 'Setting…' : `Set date on ${selected.length}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatingOpen(false)}
                      className="text-sm text-paper-faint transition-colors hover:text-paper"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {visibleUnfiled.map((memory) => {
                  const image = memory.thumb_url ?? memory.poster_url ?? memory.display_url
                  const checked = selectedSet.has(memory.id)
                  return (
                    <button
                      key={memory.id}
                      type="button"
                      onClick={() => toggle(memory.id)}
                      aria-pressed={checked}
                      aria-label={`${checked ? 'Remove' : 'Add'} ${memory.caption || memory.type} ${checked ? 'from' : 'to'} selection`}
                      className={`relative aspect-square overflow-hidden rounded-lg border transition-colors ${
                        checked
                          ? 'border-paper ring-2 ring-paper/60'
                          : 'border-edge hover:border-paper/35'
                      }`}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid h-full place-items-center bg-ink-high text-xs text-paper-faint">
                          {memory.type}
                        </span>
                      )}
                      <span
                        className={`absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border text-[11px] ${
                          checked
                            ? 'border-white bg-white text-black'
                            : 'border-white/50 bg-black/40 text-transparent'
                        }`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </button>
                  )
                })}
              </div>

              {unfiled.length > ORGANIZER_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={safePage === 0}
                    className="btn btn-ghost disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="meta-mono">
                    {safePage + 1} of {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={safePage === pageCount - 1}
                    className="btn btn-ghost disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={albumId}
                  onChange={(event) => setAlbumId(event.target.value)}
                  className="field"
                  aria-label="Destination album"
                >
                  <option value="">Choose an album</option>
                  {albumsOnly.length > 0 && (
                    <optgroup label="Albums">
                      {albumsOnly.map((album) => (
                        <option key={album.id} value={album.id}>
                          {album.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {eventAlbums.length > 0 && (
                    <optgroup label="Event albums">
                      {eventAlbums.map((album) => (
                        <option key={album.id} value={album.id}>
                          {album.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => void assignSelected()}
                  disabled={assigning || !albumId || selected.length === 0}
                  className="btn btn-primary whitespace-nowrap"
                >
                  {assigning ? 'Filing…' : `Add ${selected.length || ''} to album`}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-edge px-5 py-10">
              <p className="text-paper-soft">Everything is filed.</p>
              <p className="mt-1 text-sm text-paper-faint">
                New uploads without an album will appear here.
              </p>
            </div>
          )}
        </div>
      </section>

      {(message || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            error ? 'border-red-300/25 text-red-100' : 'border-edge text-paper-soft'
          }`}
        >
          {error ?? message}
        </p>
      )}
    </div>
  )
}
