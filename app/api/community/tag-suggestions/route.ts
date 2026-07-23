import { fail, handleError, ok } from '@/lib/api'
import { getViewer } from '@/lib/viewer'
import { readDb } from '@/lib/db'
import { avatarUrl } from '@/lib/community/avatars'

export interface TagSuggestion {
  name: string
  memberId: string | null
  profileId: string | null
  avatarUrl: string | null
}

/**
 * Everyone a tag picker can offer: every family member (so a person can be
 * tagged before they're ever tagged once), plus every name already used on a
 * tag (grandparents, family friends — anyone without an account). Members win
 * the merge when a name matches both, so the tag carries their avatar.
 */
export async function GET() {
  try {
    if (!(await getViewer())) return fail('Not signed in.', 401)
    const db = readDb()

    const [{ data: members }, { data: people }] = await Promise.all([
      db.from('members').select('id, display_name, avatar_path').order('display_name'),
      db.from('people').select('name, member_id, profile_id').order('name'),
    ])

    const suggestionsByIdentity = new Map<string, TagSuggestion>()
    for (const person of (people ?? []) as {
      name: string
      member_id: string | null
      profile_id: string | null
    }[]) {
      const key = person.member_id
        ? `member:${person.member_id}`
        : person.profile_id
          ? `profile:${person.profile_id}`
          : `name:${person.name.toLowerCase()}`
      suggestionsByIdentity.set(key, {
        name: person.name,
        memberId: person.member_id,
        profileId: person.profile_id,
        avatarUrl: null,
      })
    }
    for (const member of (members ?? []) as {
      id: string
      display_name: string
      avatar_path: string | null
    }[]) {
      suggestionsByIdentity.set(`member:${member.id}`, {
        name: member.display_name,
        memberId: member.id,
        profileId: null,
        avatarUrl: avatarUrl(member.avatar_path),
      })
    }

    const suggestions = [...suggestionsByIdentity.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    return ok({ suggestions })
  } catch (error) {
    return handleError(error, 'community/tag-suggestions')
  }
}
