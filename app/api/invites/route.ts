import { fail, handleError, ok, readJson } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { appUrl } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

/** The guest list. Owner only — this is the front door. */

export async function GET() {
  try {
    const session = await getSession()
    if (session?.profile.role !== 'owner') return fail('Only the owner can see this.', 403)

    const admin = createAdminClient()
    const [{ data: invited }, { data: profiles }] = await Promise.all([
      admin.from('allowed_emails').select('*').order('invited_at', { ascending: false }),
      admin.from('profiles').select('id, email, display_name, role, created_at'),
    ])

    const joinedByEmail = new Map(
      (profiles ?? []).map((p: { email: string }) => [p.email, p]),
    )

    return ok({
      people: (invited ?? []).map((invite: { email: string; claimed_at: string | null }) => ({
        ...invite,
        profile: joinedByEmail.get(invite.email) ?? null,
      })),
      inviteBase: appUrl(),
    })
  } catch (error) {
    return handleError(error, 'invites')
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (session?.profile.role !== 'owner') return fail('Only the owner can invite people.', 403)

    const { email, displayName, role } = await readJson<{
      email?: string
      displayName?: string
      role?: string
    }>(request)

    const address = (email ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      return fail('That does not look like an email address.')
    }

    const admin = createAdminClient()
    const { error } = await admin.from('allowed_emails').upsert(
      {
        email: address,
        display_name: (displayName ?? '').trim() || null,
        role: role === 'owner' ? 'owner' : 'family',
        invited_by: session.userId,
      },
      { onConflict: 'email' },
    )

    if (error) return fail(`Could not add them: ${error.message}`, 500)

    // No email is sent from here — the owner texts the link, which is how
    // family actually shares things.
    return ok({ invited: address, link: appUrl() })
  } catch (error) {
    return handleError(error, 'invites')
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (session?.profile.role !== 'owner') return fail('Only the owner can do that.', 403)

    const email = new URL(request.url).searchParams.get('email')?.toLowerCase()
    if (!email) return fail('Which email?')
    if (email === session.email.toLowerCase()) {
      return fail('You cannot remove yourself.')
    }

    const admin = createAdminClient()
    await admin.from('allowed_emails').delete().eq('email', email)

    // Removing the invite closes the door to new sign-ins. An existing session
    // is revoked separately in Supabase — say so rather than implying otherwise.
    return ok({
      removed: email,
      note: 'They can no longer sign in. If they are signed in right now, sign them out from Supabase → Authentication → Users.',
    })
  } catch (error) {
    return handleError(error, 'invites')
  }
}
