'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Merge two events into one — for when the same night got posted twice ("Water
 * Party" and "Hyphy Water Party"). Choose which name survives; the other's
 * content moves over and it's soft-deleted (reversible), never lost. Owner-only.
 */
export function MergeEvents({ events }: { events: { id: string; name: string }[] }) {
  const router = useRouter()
  const [survivorId, setSurvivorId] = useState('')
  const [loserId, setLoserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const nameOf = (id: string) => events.find((e) => e.id === id)?.name ?? 'that event'

  async function merge() {
    if (!survivorId || !loserId || survivorId === loserId) {
      setError('Pick two different events.')
      return
    }
    if (!confirm(`Merge “${nameOf(loserId)}” into “${nameOf(survivorId)}”? Reversible, nothing is lost.`)) {
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/community/events/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survivorId, loserId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not merge those.')
      setMessage('Merged.')
      setSurvivorId('')
      setLoserId('')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not merge those.')
    } finally {
      setBusy(false)
    }
  }

  if (events.length < 2) return null

  return (
    <div className="mt-8 border-t border-edge pt-6">
      <p className="text-sm font-medium text-paper-soft">Merge duplicates</p>
      <p className="mt-1 text-sm text-paper-faint">Same night posted twice? Combine them into one.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-xs text-paper-faint">
          Keep
          <select
            value={survivorId}
            onChange={(event) => setSurvivorId(event.target.value)}
            className="field mt-1"
            aria-label="Event to keep"
          >
            <option value="">Choose…</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-paper-faint">
          Merge in
          <select
            value={loserId}
            onChange={(event) => setLoserId(event.target.value)}
            className="field mt-1"
            aria-label="Event to merge in"
          >
            <option value="">Choose…</option>
            {events
              .filter((event) => event.id !== survivorId)
              .map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void merge()}
          disabled={busy || !survivorId || !loserId}
          className="btn btn-ghost whitespace-nowrap"
        >
          {busy ? 'Merging…' : 'Merge'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-paper-soft">{error}</p>}
      {message && <p className="mt-2 text-sm text-paper-soft">{message}</p>}
    </div>
  )
}
