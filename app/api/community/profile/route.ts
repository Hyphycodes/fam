import { fail, handleError, ok, readJson } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { createAdminClient } from '@/lib/supabase/admin'

/** Rename yourself — any viewer, passcode member or legacy email account. */
export async function POST(request: Request) {
  try {
    const viewer = await getViewer()
    if (!viewer) return fail('Sign in first.', 401)

    const { displayName } = await readJson<{ displayName?: string }>(request)
    const name = (displayName ?? '').trim().slice(0, 60)
    if (!name) return fail('A name can’t be empty.')

    const admin = createAdminClient()
    const table = viewer.kind === 'member' ? 'members' : 'profiles'
    const { error } = await admin.from(table).update({ display_name: name }).eq('id', viewer.id)
    if (error) return fail(`Could not save that: ${error.message}`, 500)

    return ok({ display_name: name })
  } catch (error) {
    return handleError(error, 'community/profile')
  }
}
