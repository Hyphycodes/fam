'use client'

import { useMemo, useState } from 'react'
import type { EventRow } from '@/lib/types'

const NEW_EVENT = '__new__'

/**
 * Which event this belongs to — or make one right here. Everything is an event
 * now (albums were folded in), and filing media means it already happened, so a
 * new one needs a name and a date.
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = useMemo(() => {
    const incoming = new Set(events.map((event) => event.id))
    return [...events, ...createdEvents.filter((event) => !incoming.has(event.id))]
  }, [createdEvents, events])

  async function create() {
    if (!name.trim() || !date || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, eventDate: date }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not create that event.')

      const created = data.event as EventRow
      setCreatedEvents((current) => [created, ...current])
      onChange(created.id)
      setCreating(false)
      setName('')
      setDate('')
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

          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Father’s Day 2023"
            className="field"
            aria-label="Event name"
          />
          <label className="block text-xs text-paper-faint">
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field mt-1 tracking-normal normal-case"
              aria-label="Event date"
            />
          </label>

          {error && <p className="text-xs text-paper-soft">{error}</p>}

          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim() || !date}
            className="btn btn-primary w-full"
          >
            {busy ? 'Creating…' : 'Create and file here'}
          </button>
        </div>
      )}
    </div>
  )
}
