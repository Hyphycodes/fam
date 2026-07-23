import 'server-only'

import type { Actor } from '@/lib/community/actor'
import type { EventStatus } from '@/lib/types'
import { canTransition, isEventStatus, isForwardTransition } from '@/lib/eventState'

/**
 * The DB-touching half of the event state machine: the one place a transition is
 * actually applied. The rules themselves are pure and live in `lib/eventState`
 * (re-exported here so callers have a single import). Nothing enforces
 * transitions but `transitionEvent()` — no scattered conditionals in routes or
 * components.
 */
export { canTransition, isEventStatus, isForwardTransition }

export interface TransitionResult {
  ok: boolean
  from?: EventStatus
  to?: EventStatus
  error?: string
  status?: number
}

/**
 * Move an event to a new lifecycle state, or fail loudly. Completing locks
 * `event_date` to the actual date (kept if already set, else the intended date,
 * else today) — and preserves every scrap of the planning stage, because the
 * update only ever touches status + the date. The flyer, comments, reactions
 * and anticipation all stay attached: looking forward to it is part of the memory.
 */
export async function transitionEvent(
  actor: Actor,
  eventId: string,
  to: string,
  opts: { actualDate?: string | null } = {},
): Promise<TransitionResult> {
  if (!isEventStatus(to)) return { ok: false, error: 'Unknown event state.', status: 400 }

  const { data: event } = await actor.db
    .from('events')
    .select('id, status, event_date, starts_at')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { ok: false, error: 'That event no longer exists.', status: 404 }

  const from = (isEventStatus(event.status) ? event.status : 'completed') as EventStatus
  if (from === to) return { ok: true, from, to } // idempotent no-op

  if (!canTransition(from, to, { isOwner: actor.isOwner })) {
    return {
      ok: false,
      error:
        isForwardTransition(to as EventStatus, from) || to === from
          ? `Only an owner can move a ${from} event back to ${to}.`
          : `A ${from} event can’t move to ${to}.`,
      status: 400,
    }
  }

  const changes: Record<string, unknown> = { status: to }
  if (to === 'completed') {
    const actual =
      normalizeDay(opts.actualDate) ??
      (event.event_date as string | null) ??
      normalizeDay(event.starts_at as string | null) ??
      new Date().toISOString().slice(0, 10)
    changes.event_date = actual
    // prompt 07 hook: completing enables Movie Mode for this event. No-op for now.
  }

  const { error } = await actor.db.from('events').update(changes).eq('id', eventId)
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true, from, to }
}

function normalizeDay(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
