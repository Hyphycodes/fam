'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PersonTagPicker, type TagChip } from '@/components/PersonTagPicker'
import { EventPicker } from '@/components/EventPicker'
import type { EventRow, MediaView } from '@/lib/types'

/**
 * Naming a memory: a caption, who's in it, which event it belongs to, and
 * whether it's one of the funny ones.
 *
 * Kept behind a disclosure so the default view is the photograph, not a form.
 */
export function MemoryEditor({
  media,
  events,
  canDelete,
}: {
  media: MediaView
  events: EventRow[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState(media.caption ?? '')
  const [eventId, setEventId] = useState(media.event_id ?? '')
  const [people, setPeople] = useState<TagChip[]>(
    media.people.map((p) => ({ name: p.name, memberId: p.member_id, avatarUrl: p.avatar_url })),
  )
  const [favorite, setFavorite] = useState(media.favorite)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      const response = await fetch(`/api/media/${media.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          eventId: eventId || null,
          favorite,
          people: people.map((p) => p.name),
        }),
      })
      if (response.ok) {
        setSaved(true)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('Remove this memory for everyone? This cannot be undone.')) return
    const response = await fetch(`/api/media/${media.id}`, { method: 'DELETE' })
    if (response.ok) router.push('/')
  }

  async function toggleFavorite() {
    const next = !favorite
    setFavorite(next)
    await fetch(`/api/media/${media.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: next }),
    })
    router.refresh()
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={toggleFavorite}
          className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
            favorite
              ? 'border-white/70 bg-white/10 text-paper'
              : 'border-edge text-paper-dim hover:bg-ink-hover'
          }`}
        >
          {favorite ? '★ One of the good ones' : '☆ Mark as funny/favourite'}
        </button>

        <button
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-edge px-3.5 py-2 text-sm text-paper-dim transition-colors hover:bg-ink-hover"
        >
          {open ? 'Close' : 'Edit details'}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-4 animate-rise">
          <div>
            <label className="mb-2 block text-xs tracking-[0.2em] text-paper-faint uppercase">
              Caption
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
            <label className="mb-2 block text-xs tracking-[0.2em] text-paper-faint uppercase">
              Who&rsquo;s in it
            </label>
            <PersonTagPicker value={people} onChange={setPeople} />
            <p className="mt-1.5 text-xs text-paper-faint">
              Search the family, or type a new name for anyone without an account.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs tracking-[0.2em] text-paper-faint uppercase">
              Event
            </label>
            <EventPicker events={events} value={eventId} onChange={setEventId} />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </button>
            {canDelete && (
              <button
                onClick={remove}
                className="text-sm text-paper-faint transition-colors hover:text-paper"
              >
                Remove this memory
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
