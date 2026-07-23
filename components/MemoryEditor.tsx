'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PersonTagPicker, type TagChip } from '@/components/PersonTagPicker'
import { EventPicker } from '@/components/EventPicker'
import { PhotoRecropButton } from '@/components/PhotoRecropButton'
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
    media.people.map((p) => ({
      name: p.name,
      memberId: p.member_id,
      profileId: p.profile_id,
      avatarUrl: p.avatar_url,
    })),
  )
  const [favorite, setFavorite] = useState(media.favorite)
  const [takenAt, setTakenAt] = useState(media.taken_at.slice(0, 10))
  const [location, setLocation] = useState(media.location_text ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const response = await fetch(`/api/media/${media.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          eventId: eventId || null,
          favorite,
          takenAt: takenAt ? new Date(`${takenAt}T12:00:00`).toISOString() : undefined,
          location,
          people: people.map((person) => ({
            name: person.name,
            memberId: person.memberId,
            profileId: person.profileId,
          })),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not save those details.')
      setSaved(true)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save those details.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('Delete this item for everyone? This cannot be undone.')) return
    const response = await fetch(`/api/media/${media.id}`, { method: 'DELETE' })
    if (response.ok) router.push('/')
  }

  async function toggleFavorite() {
    const next = !favorite
    setFavorite(next)
    setError(null)
    try {
      const response = await fetch(`/api/media/${media.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: next }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not update the favorite.')
      router.refresh()
    } catch (favoriteError) {
      setFavorite(!next)
      setError(
        favoriteError instanceof Error ? favoriteError.message : 'Could not update the favorite.',
      )
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleFavorite}
          className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
            favorite
              ? 'border-white/70 bg-white/10 text-paper'
              : 'border-edge text-paper-dim hover:bg-ink-hover'
          }`}
        >
          {favorite ? '★ Favorited' : '☆ Add to favorites'}
        </button>

        {media.type === 'photo' && media.display_url && media.download_url && canDelete && (
          <PhotoRecropButton
            mediaId={media.id}
            originalUrl={media.download_url}
            filename={media.original_filename ?? 'photo'}
            mimeType={media.mime_type}
            initial={media.crop_metadata}
          />
        )}

        <button
          type="button"
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

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs tracking-[0.2em] text-paper-faint uppercase">
              Date
              <input
                type="date"
                value={takenAt}
                onChange={(event) => setTakenAt(event.target.value)}
                className="field mt-2 tracking-normal normal-case"
              />
            </label>
            <label className="text-xs tracking-[0.2em] text-paper-faint uppercase">
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="field mt-2 tracking-normal normal-case"
                placeholder="Optional"
              />
            </label>
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
              Album or event
            </label>
            <EventPicker events={events} value={eventId} onChange={setEventId} />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                className="text-sm text-paper-faint transition-colors hover:text-paper"
              >
                Delete item
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-paper-soft">
              {error}
            </p>
          )}
        </div>
      )}
      {!open && error && (
        <p role="alert" className="mt-3 text-sm text-paper-soft">
          {error}
        </p>
      )}
    </section>
  )
}
