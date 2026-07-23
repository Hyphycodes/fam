'use client'

import { useMemo, useRef, useState } from 'react'
import type { EventRow } from '@/lib/types'

const NEW_EVENT = '__new__'

/**
 * Which event this belongs to — or make a new one right here. Creating one
 * inline means nobody has to leave the upload/edit flow to go set up the
 * event first; it's filed the moment it exists.
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
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const incoming = new Set(events.map((event) => event.id))
    return [...events, ...createdEvents.filter((event) => !incoming.has(event.id))]
  }, [createdEvents, events])

  function pickFlyer(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFlyerFile(file)
    setFlyerPreview(URL.createObjectURL(file))
  }

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      let flyerPath: string | null = null
      if (flyerFile) {
        const form = new FormData()
        form.append('file', flyerFile)
        const up = await fetch('/api/community/flyer', { method: 'POST', body: form })
        const upData = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upData.error ?? 'The flyer did not upload.')
        flyerPath = upData.flyer_path
      }

      const response = await fetch('/api/community/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, eventDate: date || null, flyerPath }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not create that event.')

      const created: EventRow = {
        id: data.id,
        name: name.trim(),
        event_date: date || null,
        cover_media_id: null,
        created_by: null,
        created_at: new Date().toISOString(),
        kind: 'event',
        description: null,
        created_by_member: null,
        flyer_path: null,
      }
      setCreatedEvents((current) => [created, ...current])
      onChange(created.id)
      setCreating(false)
      setName('')
      setDate('')
      setFlyerFile(null)
      setFlyerPreview(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <select
        value={creating ? NEW_EVENT : value}
        onChange={(event) => {
          if (event.target.value === NEW_EVENT) setCreating(true)
          else onChange(event.target.value)
        }}
        className="field"
      >
        <option value="">Not filed under anything</option>
        {list.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
        <option value={NEW_EVENT}>+ New event…</option>
      </select>

      {creating && (
        <div className="mt-3 space-y-3 rounded-xl border border-edge bg-ink-high p-4 animate-rise">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-paper-soft">New event</p>
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

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="tile block aspect-[21/9] w-full"
            aria-label="Add a flyer"
          >
            {flyerPreview ? (
              <img src={flyerPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-ink-raised text-xs text-paper-faint">
                Add a flyer (optional)
              </span>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={pickFlyer}
            className="sr-only"
          />

          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What's happening?"
            className="field"
            aria-label="Event name"
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
            {busy ? 'Creating…' : 'Create & file this here'}
          </button>
        </div>
      )}
    </div>
  )
}
