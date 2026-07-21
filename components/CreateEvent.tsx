'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Post an event to the board. Opens inline — a quiet composer, not a modal
 * wall. Uploading a flyer is optional; the event's album can supply a cover.
 */
export function CreateEvent() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null)
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function pickFlyer(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFlyerFile(file)
    setFlyerPreview(URL.createObjectURL(file))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
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
        body: JSON.stringify({ name, eventDate: date || null, description, flyerPath }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not post that.')
      router.push(`/community/${data.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <span className="text-lg leading-none">+</span> Post an event
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="settings-panel animate-rise space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">New event</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-paper-faint hover:text-paper"
        >
          Cancel
        </button>
      </div>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="tile block aspect-[16/9] w-full"
        aria-label="Add a flyer"
      >
        {flyerPreview ? (
          <img src={flyerPreview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-ink-high text-sm text-paper-faint">
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
        required
        placeholder="What's happening?"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="field text-lg"
        aria-label="Event name"
      />
      <label className="block">
        <span className="mb-1.5 block text-xs text-paper-faint">Date</span>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="field"
          aria-label="Event date"
        />
      </label>
      <textarea
        rows={3}
        placeholder="Details — where, when, what to bring…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="field resize-none"
        aria-label="Event description"
      />

      {error && <p className="text-sm text-paper-soft">{error}</p>}

      <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary w-full">
        {busy ? 'Posting…' : 'Post to the board'}
      </button>
    </form>
  )
}
