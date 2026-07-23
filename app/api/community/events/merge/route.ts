import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'

/**
 * Merge two events — build merge, never delete, so nothing that landed on either
 * one is lost. The survivor keeps its own fields (and takes the loser's flyer
 * only if it had none); all of the loser's media, artifacts, soundtrack,
 * comments, and reactions repoint to the survivor; the loser is soft-deleted
 * (merged_into), reversible for a release. Owner-only.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)
    if (!actor.isOwner) return fail('Only the owner can merge events.', 403)

    const { survivorId, loserId } = await readJson<{ survivorId?: string; loserId?: string }>(request)
    if (!survivorId || !loserId) return fail('Pick two events.')
    if (survivorId === loserId) return fail('Pick two different events.')

    const db = actor.db
    const { data: rows } = await db
      .from('events')
      .select('id, flyer_path, merged_into')
      .in('id', [survivorId, loserId])
    const survivor = (rows ?? []).find((e) => e.id === survivorId)
    const loser = (rows ?? []).find((e) => e.id === loserId)
    if (!survivor || !loser) return fail('One of those events no longer exists.', 404)
    if (survivor.merged_into || loser.merged_into) return fail('One of those was already merged.')

    // Repoint everything the loser holds.
    await db.from('media').update({ event_id: survivorId }).eq('event_id', loserId)
    await db.from('event_artifacts').update({ event_id: survivorId }).eq('event_id', loserId)
    await db.from('event_soundtracks').update({ event_id: survivorId }).eq('event_id', loserId)
    await db.from('comments').update({ collection_id: survivorId }).eq('collection_id', loserId)

    // Reactions carry a unique (collection_id, author, emoji); drop the loser's
    // duplicates before repointing so the move can't collide.
    const { data: survivorReactions } = await db
      .from('reactions')
      .select('member_id, user_id, emoji')
      .eq('collection_id', survivorId)
    const taken = new Set(
      (survivorReactions ?? []).map((r) => `${r.member_id ?? ''}|${r.user_id ?? ''}|${r.emoji}`),
    )
    const { data: loserReactions } = await db
      .from('reactions')
      .select('id, member_id, user_id, emoji')
      .eq('collection_id', loserId)
    const collidingIds = (loserReactions ?? [])
      .filter((r) => taken.has(`${r.member_id ?? ''}|${r.user_id ?? ''}|${r.emoji}`))
      .map((r) => r.id)
    if (collidingIds.length) await db.from('reactions').delete().in('id', collidingIds)
    await db.from('reactions').update({ collection_id: survivorId }).eq('collection_id', loserId)

    // Keep the loser's flyer only if the survivor lacks one.
    if (!survivor.flyer_path && loser.flyer_path) {
      await db.from('events').update({ flyer_path: loser.flyer_path }).eq('id', survivorId)
    }

    // Soft-delete the loser.
    const { error } = await db.from('events').update({ merged_into: survivorId }).eq('id', loserId)
    if (error) return fail(`Could not complete the merge: ${error.message}`, 500)

    return ok({ merged: true, survivorId })
  } catch (error) {
    return handleError(error, 'community/events/merge')
  }
}
