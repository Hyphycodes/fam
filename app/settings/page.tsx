import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import {
  EventManager,
  InviteManager,
  MusicManager,
  UploadLinkManager,
} from '@/components/FamilyManager'
import { requireSession } from '@/lib/auth'
import { appName, appUrl, isConfigured } from '@/lib/env'
import { getEvents, getInvites, getMusicTracks, getUploadLinks } from '@/lib/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const session = await requireSession()
  const db = await createClient()
  const isOwner = session.profile.role === 'owner'

  // The guest list and drop-off links live behind the service role; everything
  // else reads through the session so RLS still applies.
  const admin = isOwner ? createAdminClient() : null

  const [events, tracks, invites, links] = await Promise.all([
    getEvents(db),
    getMusicTracks(db),
    admin ? getInvites(admin) : Promise.resolve([]),
    admin ? getUploadLinks(admin, appUrl()) : Promise.resolve([]),
  ])

  return (
    <Shell session={session}>
      <h1 className="mt-6 mb-4 font-display text-display leading-none">
        {isOwner ? 'The family' : session.profile.display_name}
      </h1>
      <p className="mb-16 text-paper-dim">Signed in as {session.email}</p>

      <div className="space-y-20">
        {isOwner && <InviteManager initial={invites} inviteBase={appUrl()} />}
        <EventManager initial={events} />
        {isOwner && <UploadLinkManager initial={links} events={events} />}
        <MusicManager initial={tracks} />

        <section className="border-t border-edge pt-10">
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost">
              Sign out of {appName}
            </button>
          </form>
        </section>
      </div>
    </Shell>
  )
}
