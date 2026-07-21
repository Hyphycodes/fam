import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { ProfileEditor } from '@/components/ProfileEditor'
import { requireViewer } from '@/lib/viewer'
import { getMember } from '@/lib/member'
import { appName, isConfigured } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** A member's own corner: their picture, their name, the way out. */
export default async function YouPage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const member = viewer.kind === 'member' ? await getMember() : null

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-10 sm:mt-14">
        <p className="eyebrow">You</p>
        <h1 className="mt-3 text-[clamp(2.5rem,8vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-balance">
          {viewer.display_name}
        </h1>
      </header>

      <div className="settings-panel max-w-2xl">
        {member ? (
          <ProfileEditor displayName={member.display_name} avatarUrl={member.avatar_url} />
        ) : (
          <p className="text-paper-dim">
            You&rsquo;re signed in by email. Profile photos are for passcode members.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {viewer.role === 'owner' && (
          <Link href="/settings" className="btn btn-ghost">
            Family &amp; settings
          </Link>
        )}
        <form
          action={viewer.kind === 'member' ? '/api/community/leave' : '/api/auth/signout'}
          method="post"
        >
          <button type="submit" className="btn btn-ghost">
            Sign out of {appName}
          </button>
        </form>
      </div>
    </Shell>
  )
}
