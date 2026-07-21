import 'server-only'

import { redirect } from 'next/navigation'
import { isConfigured, ownerEmail } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export interface Session {
  userId: string
  email: string
  profile: Profile
}

export async function getSession(): Promise<Session | null> {
  if (!isConfigured('supabase')) return null

  try {
    const supabase = await createClient()
    // getUser() re-validates with the auth server; getSession() would trust a
    // cookie the browser could have edited.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) return null
    return { userId: user.id, email: user.email ?? '', profile: profile as Profile }
  } catch (error) {
    // Supabase unreachable, or a bad URL in the env. Treat it as signed out —
    // a login screen is a far better answer than a 500 page.
    console.error('[reel] could not resolve the session:', error)
    return null
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession()
  if (session.profile.role !== 'owner') redirect('/')
  return session
}

/**
 * Seeds OWNER_EMAIL onto the guest list.
 *
 * Without this the archive is a locked room with the key inside: the signup
 * trigger refuses anyone who isn't already invited, including you. Runs on the
 * login path only, and is a single idempotent upsert.
 */
export async function bootstrapOwner(): Promise<void> {
  const email = ownerEmail()
  if (!email || !isConfigured('supabase')) return

  const admin = createAdminClient()
  await admin
    .from('allowed_emails')
    .upsert({ email, role: 'owner', display_name: null }, { onConflict: 'email' })
}

/** Is this address on the guest list? Checked before a magic link is sent. */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === ownerEmail()) return true

  const admin = createAdminClient()
  const { data } = await admin
    .from('allowed_emails')
    .select('email')
    .eq('email', normalized)
    .maybeSingle()

  return Boolean(data)
}
