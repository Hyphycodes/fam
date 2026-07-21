import { fail, handleError, ok, readJson } from '@/lib/api'
import { getMember } from '@/lib/member'
import { createAdminClient } from '@/lib/supabase/admin'

/** A member renames themselves. Only the display name — never the login name. */
export async function POST(request: Request) {
  try {
    const member = await getMember()
    if (!member) return fail('Sign in first.', 401)

    const { displayName } = await readJson<{ displayName?: string }>(request)
    const name = (displayName ?? '').trim().slice(0, 60)
    if (!name) return fail('A name can’t be empty.')

    const admin = createAdminClient()
    const { error } = await admin
      .from('members')
      .update({ display_name: name })
      .eq('id', member.id)
    if (error) return fail(`Could not save that: ${error.message}`, 500)

    return ok({ display_name: name })
  } catch (error) {
    return handleError(error)
  }
}
