'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EventStatus } from '@/lib/types'

/**
 * The one control that moves an event through its lifecycle. Marking a plan
 * "happened" completes it — it joins the Timeline and keeps everything from the
 * planning stage. An owner can quietly move a completed event back if it was a
 * mistake. Every rule is enforced server-side in transitionEvent(); this is just
 * the button.
 */
export function EventLifecycle({
  eventId,
  status,
  canRevert,
}: {
  eventId: string
  status: EventStatus
  canRevert: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move(to: EventStatus, confirmMessage?: string) {
    if (busy) return
    if (confirmMessage && !confirm(confirmMessage)) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/community/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not update that.')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update that.')
    } finally {
      setBusy(false)
    }
  }

  const planned = status !== 'completed'

  return (
    <div>
      {planned ? (
        <>
          <button
            type="button"
            onClick={() => void move('completed')}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? 'Saving…' : 'Mark as happened'}
          </button>
          <p className="mt-2 text-xs text-paper-faint">
            This moves it to the Timeline. The flyer, the reactions, and everything said here come
            with it — the looking-forward is part of the memory.
          </p>
        </>
      ) : canRevert ? (
        <button
          type="button"
          onClick={() =>
            void move(
              'planned',
              'Move this back to planning? It leaves the Timeline until it’s completed again. Nothing is deleted.',
            )
          }
          disabled={busy}
          className="text-sm text-paper-faint transition-colors hover:text-paper"
        >
          Return to planning
        </button>
      ) : null}
      {error && (
        <p role="alert" className="mt-2 text-sm text-paper-soft">
          {error}
        </p>
      )}
    </div>
  )
}
