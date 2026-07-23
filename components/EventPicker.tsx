'use client'

import { useMemo, useState } from 'react'
import type { CollectionKind, EventRow } from '@/lib/types'

const NEW_COLLECTION = '__new__'

/**
 * Which album this belongs to — or make a new album/event right here. Albums
 * and Board events share one collection model, so media is filed the moment
 * the collection exists.
 */
export function EventPicker({
  events,
  value,
  onChange,
}: {
  events: EventRow[]
  value: string
  onChange: (eventId: string) => void
}) {
  const [createdEvents, setCreatedEvents] = useState<EventRow[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<CollectionKind>('album')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = useMemo(() => {
    const incoming = new Set(events.map((event) => event.id))
    return [...events, ...createdEvents.filter((event) => !incoming.has(event.id))]
  }, [createdEvents, events])
  const albums = list.filter((event) => event.kind === 'album')
  const eventAlbums = list.filter((event) => event.kind === 'event')

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, eventDate: date || null, kind }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not create that album.')

      const created = data.event as EventRow
      setCreatedEvents((current) => [created, ...current])
      onChange(created.id)
      setCreating(false)
      setName('')
      setDate('')
      setKind('album')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <select
        value={creating ? NEW_COLLECTION : value}
        onChange={(event) => {
          if (event.target.value === NEW_COLLECTION) setCreating(true)
          else onChange(event.target.value)
        }}
        className="field"
      >
        <option value="">Not filed under anything</option>
        {albums.length > 0 && (
          <optgroup label="Albums">
            {albums.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </optgroup>
        )}
        {eventAlbums.length > 0 && (
          <optgroup label="Event albums">
            {eventAlbums.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value={NEW_COLLECTION}>+ New album or event…</option>
      </select>

      {creating && (
        <div className="mt-3 space-y-3 rounded-xl border border-edge bg-ink-high p-4 animate-rise">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-paper-soft">New album or event</p>
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setError(null)
              }}
              className="text-xs text-paper-faint hover:text-paper"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2" aria-label="Collection type">
            <button
              type="button"
              onClick={() => setKind('album')}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                kind === 'album'
                  ? 'border-paper/40 bg-white/8 text-paper'
                  : 'border-edge text-paper-dim'
              }`}
            >
              <span className="block font-medium">Album</span>
              <span className="mt-0.5 block text-paper-faint">Archive only</span>
            </button>
            <button
              type="button"
              onClick={() => setKind('event')}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                kind === 'event'
                  ? 'border-paper/40 bg-white/8 text-paper'
                  : 'border-edge text-paper-dim'
              }`}
            >
              <span className="block font-medium">Event album</span>
              <span className="mt-0.5 block text-paper-faint">Can show on Board</span>
            </button>
          </div>

          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'event' ? 'What’s happening?' : 'Father’s Day 2023'}
            className="field"
            aria-label="Album or event name"
          />
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="field"
            aria-label="Event date"
          />

          {error && <p className="text-xs text-paper-soft">{error}</p>}

          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim()}
            className="btn btn-primary w-full"
          >
            {busy ? 'Creating…' : 'Create and file here'}
          </button>
        </div>
      )}
    </div>
  )
}
