'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CaptureDateFields, type CaptureDateValue } from '@/components/CaptureDateFields'
import { EventLifecycle } from '@/components/EventLifecycle'
import type { BoardEvent } from '@/lib/types'

/**
 * Editing an event, in place, on the event page — because this archive gets
 * corrected constantly (VHS dates, misfiled events, typo'd titles), so an edit
 * is a primary action, not a settings-menu chore. Every field is here: title,
 * date (the prompt-02 editor, reused), description, location, and cover. Status
 * lives in the same panel but still moves only through the state machine
 * (EventLifecycle → transitionEvent), in both directions.
 */

interface CoverCandidate {
  id: string
  thumb: string | null
  focalX: number
  focalY: number
}

const pad = (n: number) => String(n).padStart(2, '0')
function dayOf(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function EventEditor({
  event,
  covers,
  canRevert,
}: {
  event: BoardEvent
  covers: CoverCandidate[]
  canRevert: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const completed = event.status === 'completed'

  // A date-only event_date is anchored to local noon so the pre-filled picker
  // never drifts a day; starts_at is already a full instant.
  const initialDate = completed
    ? event.event_date
      ? `${event.event_date}T12:00:00`
      : null
    : event.starts_at

  const [name, setName] = useState(event.name)
  const [capture, setCapture] = useState<CaptureDateValue>({ precision: 'day', takenAt: initialDate })
  const [description, setDescription] = useState(event.description ?? '')
  const [location, setLocation] = useState(event.location ?? '')
  const [coverId, setCoverId] = useState<string | null>(event.cover_media_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (busy) return
    if (!name.trim()) {
      setError('Give it a name.')
      return
    }
    if (completed && !capture.takenAt) {
      setError('Something that already happened needs a date.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name,
        description,
        location,
        coverMediaId: coverId,
      }
      if (completed) body.eventDate = capture.takenAt ? dayOf(capture.takenAt) : null
      else body.startsAt = capture.takenAt

      const response = await fetch(`/api/community/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not save those changes.')
      setOpen(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save those changes.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-edge px-4 py-1.5 text-sm text-paper-dim transition-colors hover:border-edge-strong hover:text-paper"
      >
        Edit event
      </button>
    )
  }

  return (
    <div className="settings-panel animate-rise space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Edit event</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-paper-faint hover:text-paper"
        >
          Cancel
        </button>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs tracking-[0.14em] text-paper-faint uppercase">Title</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="field text-lg"
          aria-label="Event name"
        />
      </label>

      <div>
        <span className="mb-2 block text-xs tracking-[0.2em] text-paper-faint uppercase">
          {completed ? 'When it happened' : 'When (optional)'}
        </span>
        <CaptureDateFields idPrefix="edit-event" initialTakenAt={initialDate} onChange={setCapture} />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs tracking-[0.14em] text-paper-faint uppercase">Location</span>
        <input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Where (optional)"
          className="field"
          aria-label="Location"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs tracking-[0.14em] text-paper-faint uppercase">Details</span>
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What to bring, the plan, the vibe…"
          className="field resize-none"
          aria-label="Description"
        />
      </label>

      {covers.length > 0 && (
        <div>
          <span className="mb-2 block text-xs tracking-[0.14em] text-paper-faint uppercase">Cover</span>
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            <button
              type="button"
              onClick={() => setCoverId(null)}
              aria-pressed={coverId === null}
              className={`grid h-16 w-16 shrink-0 place-items-center rounded-lg border text-center text-[11px] leading-tight transition-colors ${
                coverId === null
                  ? 'border-white/70 bg-white/10 text-paper'
                  : 'border-edge text-paper-dim hover:bg-ink-hover'
              }`}
            >
              Auto
            </button>
            {covers.map((cover) => (
              <button
                key={cover.id}
                type="button"
                onClick={() => setCoverId(cover.id)}
                aria-pressed={coverId === cover.id}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                  coverId === cover.id ? 'border-white' : 'border-edge hover:border-edge-strong'
                }`}
              >
                {cover.thumb ? (
                  <img
                    src={cover.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: `${cover.focalX * 100}% ${cover.focalY * 100}%` }}
                  />
                ) : (
                  <span className="absolute inset-0 bg-ink-high" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-paper-soft">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !name.trim()}
          className="btn btn-primary"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="border-t border-edge pt-5">
        <span className="mb-2 block text-xs tracking-[0.14em] text-paper-faint uppercase">Status</span>
        <EventLifecycle eventId={event.id} status={event.status} canRevert={canRevert} />
      </div>
    </div>
  )
}
