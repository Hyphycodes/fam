import 'server-only'

import { redirect } from 'next/navigation'
import { getMember } from '@/lib/member'
import { getSession } from '@/lib/auth'
import { avatarUrl } from '@/lib/community/avatars'
import type { Viewer } from '@/lib/types'

/**
 * The unified "who is looking at this" resolver.
 *
 * Prefers a passcode member; falls back to a legacy magic-link account so the
 * old sign-in path keeps working during and after the transition. Every page
 * and route reads the viewer through here, so the identity mechanism can change
 * underneath without touching call sites.
 */
export async function getViewer(): Promise<Viewer | null> {
  const member = await getMember()
  if (member) {
    return {
      kind: 'member',
      id: member.id,
      display_name: member.display_name,
      avatar_url: member.avatar_url,
      role: member.role,
      memberId: member.id,
    }
  }

  const session = await getSession()
  if (session) {
    return {
      kind: 'legacy',
      id: session.profile.id,
      display_name: session.profile.display_name,
      avatar_url: avatarUrl(session.profile.avatar_url),
      role: session.profile.role === 'owner' ? 'owner' : 'member',
      memberId: null,
    }
  }

  return null
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect('/enter')
  return viewer
}

export async function requireOwnerViewer(): Promise<Viewer> {
  const viewer = await requireViewer()
  if (viewer.role !== 'owner') redirect('/')
  return viewer
}
