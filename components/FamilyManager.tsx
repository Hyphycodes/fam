'use client'

import { useState } from 'react'
import type { Invite, UploadLink } from '@/lib/queries'
import type { EventRow } from '@/lib/types'
import { fullDate, warmDate } from '@/lib/format'

/**
 * Owner tools: the guest list, event drop-links, events, and the Movie Mode
 * music.
 *
 * Every list arrives as a prop from the server component, so nothing here
 * fetches on mount — the page is populated on first paint, and refetching only
 * happens after something is actually changed.
 */

export function InviteManager({
  initial,
  inviteBase,
}: {
  initial: Invite[]
  inviteBase: string
}) {
  const [people, setPeople] = useState(initial)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function reload() {
    const response = await fetch('/api/invites')
    if (!response.ok) return
    const data = (await response.json()) as { people: Invite[] }
    setPeople(data.people)
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName: name }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? 'That did not work.')
        return
      }
      setEmail('')
      setName('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function remove(address: string) {
    if (!confirm(`Remove ${address} from the family list?`)) return
    await fetch(`/api/invites?email=${encodeURIComponent(address)}`, { method: 'DELETE' })
    await reload()
  }

  return (
    <section>
      <p className="eyebrow mb-3">Family members &amp; invitations</p>
      <h2 className="mb-2 font-display text-title">Bring everyone in</h2>
      <p className="mb-8 max-w-lg text-paper-dim">
        Add someone&rsquo;s email, then text them the link. They sign in with a link to their
        own inbox — no password to invent or forget.
      </p>

      <form onSubmit={invite} className="mb-8 flex flex-wrap gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="cousin@example.com"
          className="field flex-1 basis-56"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What we call them"
          className="field flex-1 basis-44"
        />
        <button type="submit" disabled={busy || !email} className="btn btn-primary">
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="mb-6 text-sm text-ember-soft">{error}</p>}

      <button
        onClick={() => {
          void navigator.clipboard.writeText(inviteBase)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="mb-8 w-full rounded-xl border border-edge bg-ink-high px-4 py-3 text-left transition-colors hover:bg-ink-hover"
      >
        <p className="text-xs tracking-[0.2em] text-paper-faint uppercase">
          {copied ? 'Copied' : 'The link to send them'}
        </p>
        <p className="mt-1 truncate font-mono text-sm text-paper-soft">{inviteBase}</p>
      </button>

      <ul className="divide-y divide-[color:var(--color-edge)]">
        {people.map((person) => (
          <li key={person.email} className="flex flex-col items-start justify-between gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="truncate text-paper">
                {person.display_name || person.email.split('@')[0]}
                {person.role === 'owner' && (
                  <span className="ml-2 text-xs tracking-wider text-ember uppercase">owner</span>
                )}
              </p>
              <p className="truncate text-sm text-paper-faint">{person.email}</p>
            </div>
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xs text-paper-faint">
                {person.claimed_at ? `joined ${warmDate(person.claimed_at)}` : 'not yet joined'}
              </span>
              {person.role !== 'owner' && (
                <button
                  onClick={() => remove(person.email)}
                  aria-label={`Remove ${person.display_name || person.email} from the family`}
                  className="text-xs text-paper-faint transition-colors hover:text-ember-soft"
                >
                  remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function UploadLinkManager({
  initial,
  events,
}: {
  initial: UploadLink[]
  events: EventRow[]
}) {
  const [links, setLinks] = useState(initial)
  const [eventId, setEventId] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!eventId) return
    setBusy(true)
    try {
      const response = await fetch('/api/upload-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      if (response.ok) {
        const data = (await response.json()) as { link: UploadLink & { event_id: string } }
        const name = events.find((e) => e.id === eventId)?.name ?? null
        setLinks((current) => [{ ...data.link, event_name: name }, ...current])
        setEventId('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setLinks((current) => current.filter((link) => link.id !== id))
    await fetch(`/api/upload-links?id=${id}`, { method: 'DELETE' })
  }

  return (
    <section>
      <p className="eyebrow mb-3">Guest upload links</p>
      <h2 className="mb-2 font-display text-title">Open a side door</h2>
      <p className="mb-8 max-w-lg text-paper-dim">
        A link anyone can open — no account, no app tour — that puts their photos and videos
        straight into one event. Good for the group chat after a cookout.
      </p>

      {events.length === 0 ? (
        <p className="text-sm text-paper-faint">
          Make an event first and these become available.
        </p>
      ) : (
        <form onSubmit={create} className="mb-8 flex flex-wrap gap-3">
          <select
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            className="field flex-1 basis-56"
          >
            <option value="">Which event?</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !eventId} className="btn btn-primary">
            {busy ? 'Making…' : 'Make a link'}
          </button>
        </form>
      )}

      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-paper">{link.event_name ?? 'An event'}</p>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(link.url)
                    setCopiedId(link.id)
                    setTimeout(() => setCopiedId(null), 2000)
                  }}
                  className="mt-1 block w-full truncate text-left font-mono text-xs text-paper-dim transition-colors hover:text-paper"
                >
                  {copiedId === link.id ? 'Copied to clipboard' : link.url}
                </button>
              </div>
              <button
                onClick={() => revoke(link.id)}
                aria-label={`Turn off upload link for ${link.event_name ?? 'this event'}`}
                className="shrink-0 text-xs text-paper-faint transition-colors hover:text-ember-soft"
              >
                turn off
              </button>
            </div>
          </li>
        ))}
      </ul>
      {links.length === 0 && events.length > 0 && (
        <p className="text-sm text-paper-faint">No guest links are open right now.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

export function EventManager({
  initial,
}: {
  initial: (EventRow & { media_count: number })[]
}) {
  const [list, setList] = useState(initial)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, eventDate: date || null }),
      })
      if (response.ok) {
        const data = (await response.json()) as { event: EventRow }
        setList((current) => [{ ...data.event, media_count: 0 }, ...current])
        setName('')
        setDate('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <p className="eyebrow mb-3">Events &amp; collections</p>
      <h2 className="mb-2 font-display text-title">Shape the chapters</h2>
      <p className="mb-8 max-w-lg text-paper-dim">
        A cookout, a trip, a christening. Memories filed under one become a chapter in Movie
        Mode.
      </p>

      <form onSubmit={create} className="mb-8 flex flex-wrap gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Hyphy Water Party"
          className="field flex-1 basis-56"
        />
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="field basis-44"
        />
        <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary">
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>

      <ul className="divide-y divide-[color:var(--color-edge)]">
        {list.map((event) => (
          <li key={event.id} className="flex items-baseline justify-between gap-4 py-3.5">
            <a
              href={`/collection/event/${event.id}`}
              className="min-w-0 transition-colors hover:text-ember"
            >
              <p className="truncate font-display text-xl">{event.name}</p>
              {event.event_date && (
                <p className="text-xs text-paper-faint">{fullDate(event.event_date)}</p>
              )}
            </a>
            <span className="shrink-0 text-sm text-paper-faint">
              {event.media_count} {event.media_count === 1 ? 'memory' : 'memories'}
            </span>
          </li>
        ))}
      </ul>
      {list.length === 0 && (
        <p className="text-sm text-paper-faint">
          No chapters yet. Create the first event when the next family day is worth gathering.
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

export function MusicManager({ initial }: { initial: { id: string; title: string }[] }) {
  const [tracks, setTracks] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)

    try {
      for (const file of Array.from(files)) {
        const type = file.type || 'audio/mpeg'

        const presign = await fetch('/api/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: type }),
        })
        if (!presign.ok) throw new Error('presign')
        const { key, putUrl } = (await presign.json()) as { key: string; putUrl: string }

        // Content-Type must match what was signed, exactly.
        const put = await fetch(putUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': type },
        })
        if (!put.ok) throw new Error('put')

        const save = await fetch('/api/music', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, title: file.name.replace(/\.[^.]+$/, '') }),
        })
        if (save.ok) {
          const data = (await save.json()) as { track: { id: string; title: string } }
          setTracks((current) => [...current, data.track])
        }
      }
    } catch {
      setError('That track did not upload. Try again?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <p className="eyebrow mb-3">Soundtrack</p>
      <h2 className="mb-2 font-display text-title">Set the room&rsquo;s tone</h2>
      <p className="mb-8 max-w-lg text-paper-dim">
        What plays under Movie Mode. It ducks automatically when a video with its own sound
        comes up, then swells back on the photos.
      </p>

      <label className="btn btn-ghost mb-6 cursor-pointer">
        {busy ? 'Uploading…' : 'Add a track'}
        <input
          type="file"
          accept="audio/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            void upload(event.target.files)
            event.target.value = ''
          }}
        />
      </label>

      {error && <p className="mb-4 text-sm text-ember-soft">{error}</p>}

      <ul className="divide-y divide-[color:var(--color-edge)]">
        {tracks.map((track) => (
          <li key={track.id} className="flex items-center justify-between gap-4 py-3">
            <p className="truncate text-paper-soft">{track.title}</p>
            <button
              aria-label={`Remove ${track.title} from the soundtrack`}
              onClick={async () => {
                setTracks((current) => current.filter((t) => t.id !== track.id))
                await fetch(`/api/music?id=${track.id}`, { method: 'DELETE' })
              }}
              className="shrink-0 text-xs text-paper-faint transition-colors hover:text-ember-soft"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      {tracks.length === 0 && (
        <p className="text-sm text-paper-faint">
          Movie Mode works without music. Add a track whenever the archive needs a score.
        </p>
      )}
    </section>
  )
}
