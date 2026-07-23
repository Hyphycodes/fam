import type { EventStatus } from '@/lib/types'

/**
 * The pure event state machine — the transition rules, with no I/O, so they can
 * be reasoned about and unit-tested on their own. The DB-touching part
 * (`transitionEvent`) lives in `lib/community/eventState` and builds on these.
 *
 * The full arc is planned → upcoming → live → completed. Only the two endpoints
 * ship now; the middle states are valid targets so they slot in later with no
 * migration. `planned → completed` directly is the only forward path any UI
 * drives today. Reverse moves are admin-only corrections.
 */

const FORWARD: Record<EventStatus, EventStatus[]> = {
  planned: ['upcoming', 'completed'],
  upcoming: ['live', 'completed'],
  live: ['completed'],
  completed: [],
}

const STATUSES: EventStatus[] = ['planned', 'upcoming', 'live', 'completed']

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === 'string' && (STATUSES as string[]).includes(value)
}

export function isForwardTransition(from: EventStatus, to: EventStatus): boolean {
  return FORWARD[from]?.includes(to) ?? false
}

/** Forward moves are open to any member; reverse moves are an owner correction. */
export function canTransition(
  from: EventStatus,
  to: EventStatus,
  opts: { isOwner: boolean },
): boolean {
  if (from === to) return false
  if (isForwardTransition(from, to)) return true
  return opts.isOwner // any backward move is an admin correction
}
