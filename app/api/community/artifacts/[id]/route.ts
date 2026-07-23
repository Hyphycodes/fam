import { fail, handleError, ok } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { isConfigured } from '@/lib/env'
import { deleteObjects } from '@/lib/r2'

/** Remove an artifact — whoever added it, or the owner. Cleans up its R2 object. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id } = await params
    const { data: row } = await actor.db
      .from('event_artifacts')
      .select('id, storage_key, created_by_member, created_by')
      .eq('id', id)
      .maybeSingle()
    if (!row) return ok({ deleted: true }) // already gone

    const mine = actor.owns({ member_id: row.created_by_member, user_id: row.created_by })
    if (!mine && !actor.isOwner) {
      return fail('Only whoever added this — or the owner — can remove it.', 403)
    }

    const { error } = await actor.db.from('event_artifacts').delete().eq('id', id)
    if (error) return fail(`Could not remove that: ${error.message}`, 500)

    if (row.storage_key && isConfigured('r2')) {
      try {
        await deleteObjects([row.storage_key])
      } catch (storageError) {
        console.error('[reel] could not delete artifact object', id, storageError)
      }
    }
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error, 'community/artifacts')
  }
}
