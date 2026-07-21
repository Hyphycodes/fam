'use client'

import { useEffect, useState } from 'react'
import { PersonTagPicker, type TagChip } from '@/components/PersonTagPicker'
import { EventPicker } from '@/components/EventPicker'
import type { EventRow } from '@/lib/types'
import type { UploadDetails } from '@/lib/client/uploader'

/**
 * Shown the moment files are picked, before a single byte moves — caption,
 * who's in it, and the event are right here instead of a trip back to "edit
 * details" afterward. Every field is optional; skipping straight to "Add"
 * keeps the zero-friction path intact.
 */
export function UploadDetailsSheet({
  fileCount,
  defaultEventId,
  onCancel,
  onConfirm,
}: {
  fileCount: number
  defaultEventId?: string | null
  onCancel: () => void
  onConfirm: (details: UploadDetails) => void
}) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [caption, setCaption] = useState('')
  const [people, setPeople] = useState<TagChip[]>([])
  const [eventId, setEventId] = useState(defaultEventId ?? '')

  useEffect(() => {
    let live = true
    void fetch('/api/events')
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data: { events: EventRow[] }) => {
        if (live) setEvents(data.events)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  function confirm() {
    onConfirm({
      caption: caption.trim() || undefined,
      people: people.length ? people.map((p) => ({ name: p.name })) : undefined,
      eventId: eventId || null,
    })
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:pb-32">
      <div
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-ink-raised/97 shadow-2xl backdrop-blur-xl animate-rise"
        role="dialog"
        aria-label="Add details before uploading"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <p className="text-lg font-semibold tracking-[-0.01em]">
            {fileCount} {fileCount === 1 ? 'memory' : 'memories'}
          </p>
          <button
            onClick={onCancel}
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Cancel
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 pb-2">
          <div>
            <label className="mb-1.5 block text-xs text-paper-faint">
              Caption {fileCount > 1 ? '(applies to all of them)' : ''}
            </label>
            <textarea
              rows={2}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="The water balloon incident"
              className="field resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-paper-faint">Who&rsquo;s in it</label>
            <PersonTagPicker value={people} onChange={setPeople} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-paper-faint">Event</label>
            <EventPicker events={events} value={eventId} onChange={setEventId} />
          </div>
        </div>

        <div className="px-5 pt-3 pb-4">
          <button onClick={confirm} className="btn btn-primary w-full">
            Add {fileCount === 1 ? 'memory' : `${fileCount} memories`}
          </button>
        </div>
      </div>
    </div>
  )
}
