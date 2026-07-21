import 'server-only'

import { getViewer } from '@/lib/viewer'
import { createAdminClient } from '@/lib/supabase/admin'
import { avatarUrl } from '@/lib/community/avatars'
import type { DB } from '@/lib/api'
import type { Author } from '@/lib/types'

/**
 * The person behind a community write, from either identity system.
 *
 * A member attributes to `member_id`; a legacy magic-link account to `user_id`.
 * `attribution()` yields the right column so a route can stay identity-agnostic:
 *   insert({ ...subject, ...actor.attribution() })
 */
export interface Actor {
  kind: 'member' | 'legacy'
  memberId: string | null
  userId: string | null
  display_name: string
  avatar_url: string | null
  isOwner: boolean
  db: DB
  attribution(): { member_id: string } | { user_id: string }
  /** True if a stored (user_id, member_id) pair belongs to this actor. */
  owns(row: { user_id?: string | null; member_id?: string | null }): boolean
}

export async function getActor(): Promise<Actor | null> {
  const viewer = await getViewer()
  if (!viewer) return null

  const isMember = viewer.kind === 'member'
  const memberId = isMember ? viewer.memberId : null
  const userId = isMember ? null : viewer.id

  return {
    kind: viewer.kind,
    memberId,
    userId,
    display_name: viewer.display_name,
    avatar_url: viewer.avatar_url,
    isOwner: viewer.role === 'owner',
    db: createAdminClient(),
    attribution: () => (isMember ? { member_id: memberId! } : { user_id: userId! }),
    owns: (row) =>
      isMember ? row.member_id === memberId : row.user_id === userId,
  }
}

/**
 * Resolve display names + avatars for a mixed set of authors (some members,
 * some legacy profiles) in two queries. Returns a lookup keyed by both id
 * spaces, since a row carries at most one.
 */
export async function resolveAuthors(
  db: DB,
  rows: { user_id?: string | null; member_id?: string | null }[],
): Promise<{
  memberById: Map<string, Author>
  profileById: Map<string, Author>
}> {
  const memberIds = [...new Set(rows.map((r) => r.member_id).filter(Boolean))] as string[]
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[]

  const [members, profiles] = await Promise.all([
    memberIds.length
      ? db.from('members').select('id, display_name, avatar_path').in('id', memberIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? db.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const memberById = new Map<string, Author>(
    ((members.data ?? []) as { id: string; display_name: string; avatar_path: string | null }[]).map(
      (m) => [m.id, { id: m.id, display_name: m.display_name, avatar_url: avatarUrl(m.avatar_path) }],
    ),
  )
  const profileById = new Map<string, Author>(
    ((profiles.data ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map(
      (p) => [p.id, { id: p.id, display_name: p.display_name, avatar_url: avatarUrl(p.avatar_url) }],
    ),
  )

  return { memberById, profileById }
}

/** The display author for one row, given resolved lookups. */
export function authorOf(
  row: { user_id?: string | null; member_id?: string | null },
  maps: { memberById: Map<string, Author>; profileById: Map<string, Author> },
): Author {
  if (row.member_id && maps.memberById.has(row.member_id)) return maps.memberById.get(row.member_id)!
  if (row.user_id && maps.profileById.has(row.user_id)) return maps.profileById.get(row.user_id)!
  return { id: row.member_id ?? row.user_id ?? 'someone', display_name: 'Someone', avatar_url: null }
}
