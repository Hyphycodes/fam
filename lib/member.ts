import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { familyPasscode } from '@/lib/env'
import { avatarUrl } from '@/lib/community/avatars'
import type { Member } from '@/lib/types'

/**
 * The passcode identity layer.
 *
 * Deliberately its own module and its own cookie, with no dependency on
 * Supabase Auth. Swapping in real auth later means replacing this file and
 * `getMember()` — nothing that reads a Member has to change.
 *
 * A session is an opaque random token. Only its SHA-256 lives in the database
 * (`member_sessions.token_hash`); the raw token lives only in an httpOnly
 * cookie. So a leaked table row can't be replayed as a login.
 */

const COOKIE = 'fam_session'
const SESSION_DAYS = 365

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time passcode check, tolerant of length differences. */
function passcodeMatches(input: string): boolean {
  const secret = familyPasscode()
  if (!secret) return false
  const a = Buffer.from(input)
  const b = Buffer.from(secret)
  if (a.length !== b.length) {
    // Still hash a comparison so timing doesn't leak the length.
    timingSafeEqual(Buffer.from(hashToken(input)), Buffer.from(hashToken(input)))
    return false
  }
  return timingSafeEqual(a, b)
}

function rowToMember(row: Record<string, unknown>): Member {
  return {
    id: row.id as string,
    first_name: row.first_name as string,
    last_initial: (row.last_initial as string | null) ?? null,
    display_name: row.display_name as string,
    login_key: row.login_key as string,
    avatar_path: (row.avatar_path as string | null) ?? null,
    avatar_url: avatarUrl(row.avatar_path as string | null),
    role: (row.role as Member['role']) ?? 'member',
    created_at: row.created_at as string,
    last_seen_at: (row.last_seen_at as string | null) ?? null,
  }
}

/** The member behind the current session cookie, or null. */
export async function getMember(): Promise<Member | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('member_sessions')
    .select('id, member_id, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!session) return null
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    await admin.from('member_sessions').delete().eq('id', session.id)
    return null
  }

  const { data: member } = await admin
    .from('members')
    .select('*')
    .eq('id', session.member_id)
    .maybeSingle()
  if (!member) return null

  return rowToMember(member as Record<string, unknown>)
}

export async function requireMember(): Promise<Member> {
  const member = await getMember()
  if (!member) redirect('/enter')
  return member
}

export interface EnterResult {
  ok: boolean
  error?: string
  /** True when the name matches more than one member and a last initial is needed. */
  needsInitial?: boolean
  choices?: { last_initial: string | null; display_name: string }[]
}

/**
 * Validate a name + passcode and, on success, mint a session (sets the cookie).
 * Kept low-friction: a bare first name is enough unless it's shared, in which
 * case we ask for the last initial rather than making everyone type one.
 */
export async function enterWithPasscode(
  firstNameRaw: string,
  passcode: string,
  lastInitialRaw?: string,
  userAgent?: string,
): Promise<EnterResult> {
  const firstName = firstNameRaw.trim().toLowerCase()
  const lastInitial = (lastInitialRaw ?? '').trim().toLowerCase()
  if (!firstName) return { ok: false, error: 'Tell us your first name.' }
  if (!passcodeMatches(passcode)) {
    return { ok: false, error: 'That passcode is not right. Ask the family for it.' }
  }

  const admin = createAdminClient()
  const { data: matches } = await admin
    .from('members')
    .select('id, display_name, last_initial')
    .eq('first_name', firstNameRaw.trim())

  const people = (matches ?? []) as {
    id: string
    display_name: string
    last_initial: string | null
  }[]

  if (people.length === 0) {
    return { ok: false, error: `We don't see "${firstNameRaw.trim()}" on the family list.` }
  }

  let member = people[0]
  if (people.length > 1) {
    if (!lastInitial) {
      return {
        ok: false,
        needsInitial: true,
        error: `There's more than one ${firstNameRaw.trim()}. Which one?`,
        choices: people.map((p) => ({
          last_initial: p.last_initial,
          display_name: p.display_name,
        })),
      }
    }
    const picked = people.find((p) => (p.last_initial ?? '').toLowerCase() === lastInitial)
    if (!picked) {
      return { ok: false, needsInitial: true, error: 'That initial did not match.' }
    }
    member = picked
  }

  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await admin.from('member_sessions').insert({
    member_id: member.id,
    token_hash: hashToken(token),
    user_agent: userAgent?.slice(0, 400) ?? null,
    expires_at: expires.toISOString(),
  })
  await admin.from('members').update({ last_seen_at: new Date().toISOString() }).eq('id', member.id)

  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })

  return { ok: true }
}

/** Drop the current session — deletes the row and clears the cookie. */
export async function signOutMember(): Promise<void> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (token) {
    const admin = createAdminClient()
    await admin.from('member_sessions').delete().eq('token_hash', hashToken(token))
  }
  store.delete(COOKIE)
}

/** Names for the entry screen's autocomplete. No passcode, no session needed. */
export async function listMemberNames(): Promise<
  { first_name: string; last_initial: string | null; display_name: string }[]
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('members')
    .select('first_name, last_initial, display_name')
    .order('first_name')
  return (data ?? []) as {
    first_name: string
    last_initial: string | null
    display_name: string
  }[]
}
