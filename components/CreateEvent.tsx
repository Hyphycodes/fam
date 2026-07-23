'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Plan something on the board. Opens inline — a quiet composer, not a modal
 * wall. The flyer is the artwork you made; the intended date is optional
 * ("sometime this summer" is fine). Nothing has happened yet, so there's no
 * upload here — just the plan, and room to react and talk under it.
 */
export function CreateEvent() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
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
        body: JSON.stringify({
          name,
          status: 'planned',
          startsAt: date || null,
          location: location || null,
          description,
          flyerPath,
        }),
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
        <span className="text-lg leading-none">+</span> Plan something
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="settings-panel animate-rise space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Plan something</h2>
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
        placeholder="What are we planning?"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="field text-lg"
        aria-label="What are we planning?"
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-paper-faint">When (optional)</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="field"
            aria-label="Intended date"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-paper-faint">Where (optional)</span>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="field"
            placeholder="Grandma’s"
            aria-label="Location"
          />
        </label>
      </div>
      <textarea
        rows={3}
        placeholder="Details — what to bring, the plan, the vibe…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="field resize-none"
        aria-label="Description"
      />

      {error && <p className="text-sm text-paper-soft">{error}</p>}

      <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary w-full">
        {busy ? 'Posting…' : 'Add to the board'}
      </button>
    </form>
  )
}
