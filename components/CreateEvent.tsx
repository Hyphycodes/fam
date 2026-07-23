'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CaptureDateFields, type CaptureDateValue } from '@/components/CaptureDateFields'

/**
 * Create an event on the board. Two explicit choices, no silent defaults: what
 * it is (a plan vs. something that already happened) and — reusing the prompt-02
 * date editor — when. A completed event requires a date; a plan's date is
 * optional ("sometime this summer"). The flyer is the artwork you made.
 */
export function CreateEvent() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'planned' | 'completed'>('planned')
  const [name, setName] = useState('')
  const [capture, setCapture] = useState<CaptureDateValue>({ precision: 'day', takenAt: null })
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null)
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forcing, setForcing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const completed = status === 'completed'

  function pickFlyer(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFlyerFile(file)
    setFlyerPreview(URL.createObjectURL(file))
  }

  function dayOf(iso: string): string {
    const date = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  async function submit(force = false) {
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
          status,
          force,
          eventDate: completed && capture.takenAt ? dayOf(capture.takenAt) : null,
          startsAt: !completed ? capture.takenAt : null,
          location: location || null,
          description,
          flyerPath,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not post that.')

      if (data.warning && !force) {
        setError(`${data.warning} Post anyway?`)
        setBusy(false)
        // Next click on the primary button forces it.
        setForcing(true)
        return
      }
      router.push(`/community/${data.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <span className="text-lg leading-none">+</span> Create an event
      </button>
    )
  }

  return (
    <div className="settings-panel animate-rise space-y-4">
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="What is this?">
        {(
          [
            ['planned', 'Planning something', 'It hasn’t happened yet'],
            ['completed', 'Something that happened', 'Add it to the timeline'],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value)
              setForcing(false)
              setError(null)
            }}
            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
              status === value
                ? 'border-paper/40 bg-white/8 text-paper'
                : 'border-edge text-paper-dim hover:bg-ink-high'
            }`}
          >
            <span className="block text-sm font-medium">{label}</span>
            <span className="mt-0.5 block text-xs text-paper-faint">{hint}</span>
          </button>
        ))}
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
        placeholder={completed ? 'What happened?' : 'What are we planning?'}
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          setForcing(false)
        }}
        className="field text-lg"
        aria-label="Event name"
      />

      <div>
        <span className="mb-2 block text-xs tracking-[0.2em] text-paper-faint uppercase">
          {completed ? 'When it happened' : 'When (optional)'}
        </span>
        <CaptureDateFields onChange={setCapture} idPrefix="event" />
      </div>

      <input
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="Where (optional)"
        className="field"
        aria-label="Location"
      />
      <textarea
        rows={3}
        placeholder="Details — what to bring, the plan, the vibe…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="field resize-none"
        aria-label="Description"
      />

      {error && <p className="text-sm text-paper-soft">{error}</p>}

      <button
        type="button"
        onClick={() => void submit(forcing)}
        disabled={busy || !name.trim()}
        className="btn btn-primary w-full"
      >
        {busy ? 'Posting…' : forcing ? 'Post anyway' : completed ? 'Add to the timeline' : 'Add to the board'}
      </button>
    </div>
  )
}
