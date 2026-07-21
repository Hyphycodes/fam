import { fail, handleError, ok, readJson } from '@/lib/api'
import { bootstrapOwner, isEmailAllowed } from '@/lib/auth'
import { appUrl } from '@/lib/env'
import { safeNext } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'

/**
 * Sends the sign-in link.
 *
 * The allowlist is checked here so an uninvited person gets a sentence they can
 * understand instead of a link that silently fails at the database trigger. The
 * trigger is still the real gate — this is just manners.
 */
export async function POST(request: Request) {
  try {
    const { email, next } = await readJson<{ email?: string; next?: string }>(request)
    const address = (email ?? '').trim().toLowerCase()

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return fail('That does not look like an email address.')
    }

    // Puts OWNER_EMAIL on the guest list, so the first sign-in ever can work.
    await bootstrapOwner()

    if (!(await isEmailAllowed(address))) {
      return fail(
        'That email is not on the family list yet. Ask whoever sent you here to add it.',
        403,
      )
    }

    const supabase = await createClient()
    const redirectTo = new URL('/auth/callback', appUrl())
    const destination = safeNext(next, '')
    if (destination) redirectTo.searchParams.set('next', destination)

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: redirectTo.toString(),
        // The trigger would refuse an uninvited user anyway; this makes Supabase
        // refuse first, so no orphaned auth row is ever created.
        shouldCreateUser: true,
      },
    })

    if (error) {
      if (/rate|too many/i.test(error.message)) {
        return fail('A link was just sent. Check your email, or try again in a minute.', 429)
      }
      return fail(`Could not send the link: ${error.message}`, 500)
    }

    return ok({ sent: true })
  } catch (error) {
    return handleError(error)
  }
}
