'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SoundtrackProvider, SoundtrackView } from '@/lib/types'

/**
 * A playlist attached to an event — a beautiful doorway, not a player. Artwork
 * up front, title, track count, and one action: open it where it lives.
 * Playback stays in the provider's app; there's no embedded player here.
 */
const PROVIDER_LABEL: Record<SoundtrackProvider, string> = {
  apple_music: 'Apple Music',
  spotify: 'Spotify',
  other: 'the playlist',
}

export function Soundtrack({
  eventId,
  soundtrack,
  canEdit,
}: {
  eventId: string
  soundtrack: SoundtrackView | null
  canEdit: boolean
}) {
  if (soundtrack) return <SoundtrackCard eventId={eventId} soundtrack={soundtrack} canEdit={canEdit} />
  if (canEdit) return <SoundtrackComposer eventId={eventId} />
  return null
}

function SoundtrackCard({
  eventId,
  soundtrack,
  canEdit,
}: {
  eventId: string
  soundtrack: SoundtrackView
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (busy || !confirm('Remove this soundtrack?')) return
    setBusy(true)
    try {
      const response = await fetch(`/api/community/events/${eventId}/soundtrack`, { method: 'DELETE' })
      if (response.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-edge bg-ink-raised p-3">
      <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-ink-high">
        {soundtrack.artwork_url ? (
          <img src={soundtrack.artwork_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-2xl" aria-hidden="true">
            ♫
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow mb-1 text-paper-faint">Soundtrack</p>
        <p className="truncate text-lg font-semibold tracking-[-0.01em] text-paper">
          {soundtrack.title ?? 'Playlist'}
        </p>
        <p className="meta-mono mt-0.5 text-paper-faint">
          {PROVIDER_LABEL[soundtrack.provider]}
          {soundtrack.track_count ? ` · ${soundtrack.track_count} tracks` : ''}
        </p>
        <div className="mt-2 flex items-center gap-4">
          <a
            href={soundtrack.external_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-paper transition-colors hover:text-white"
          >
            Open in {PROVIDER_LABEL[soundtrack.provider]} →
          </a>
          {canEdit && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="text-sm text-paper-faint transition-colors hover:text-paper"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SoundtrackComposer({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [needsManual, setNeedsManual] = useState(false)
  const [title, setTitle] = useState('')
  const [trackCount, setTrackCount] = useState('')
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function submit() {
    if (busy) return
    if (!url.trim()) {
      setError('Paste a playlist link first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Manual artwork (optional) rides the existing flyer bucket → a stable
      // public URL cached in the row.
      let artworkPath: string | null = null
      if (needsManual && artworkFile) {
        const form = new FormData()
        form.append('file', artworkFile)
        const up = await fetch('/api/community/flyer', { method: 'POST', body: form })
        const upData = await up.json().catch(() => ({}))
        if (up.ok) artworkPath = upData.flyer_path ?? null
      }

      const response = await fetch(`/api/community/events/${eventId}/soundtrack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          needsManual
            ? {
                url: url.trim(),
                manual: true,
                title: title || null,
                trackCount: trackCount ? Number(trackCount) : null,
                artworkPath,
              }
            : { url: url.trim() },
        ),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not add that.')

      if (data.needsManual) {
        // Metadata didn't resolve — fall through to manual entry, no dead end.
        setNeedsManual(true)
        setError('Couldn’t read that playlist automatically — add the details by hand.')
        return
      }
      setOpen(false)
      setUrl('')
      setNeedsManual(false)
      setTitle('')
      setTrackCount('')
      setArtworkFile(null)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <span aria-hidden="true">♫</span> Add a soundtrack
      </button>
    )
  }

  return (
    <div className="settings-panel animate-rise space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold tracking-[-0.01em]">Soundtrack</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-paper-faint hover:text-paper">
          Cancel
        </button>
      </div>

      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="Paste an Apple Music playlist link"
        inputMode="url"
        className="field"
        aria-label="Playlist URL"
      />

      {needsManual && (
        <div className="space-y-3 border-t border-edge pt-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Playlist title"
            className="field"
            aria-label="Playlist title"
          />
          <input
            value={trackCount}
            onChange={(event) => setTrackCount(event.target.value.replace(/\D/g, ''))}
            placeholder="Number of tracks (optional)"
            inputMode="numeric"
            className="field"
            aria-label="Track count"
          />
          <button type="button" onClick={() => fileInput.current?.click()} className="tile block aspect-[3/1] w-full">
            <span className="grid h-full w-full place-items-center bg-ink-high text-sm text-paper-faint">
              {artworkFile ? artworkFile.name : 'Add artwork (optional)'}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setArtworkFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-paper-soft">
          {error}
        </p>
      )}

      <button type="button" onClick={() => void submit()} disabled={busy} className="btn btn-primary">
        {busy ? 'Adding…' : needsManual ? 'Save soundtrack' : 'Add'}
      </button>
    </div>
  )
}
