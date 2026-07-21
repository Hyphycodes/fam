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
      <header className="mt-8 mb-10 max-w-3xl sm:mt-14 sm:mb-14">
        <p className="eyebrow">Keep the archive growing</p>
        <h1 className="mt-4 font-display text-[clamp(3.5rem,9vw,6.5rem)] leading-[0.88] tracking-[-0.035em] text-balance">
          {isOwner ? 'The family room' : session.profile.display_name}
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-paper-dim">
          {isOwner
            ? 'Invite the people who belong here, shape memories into chapters, and choose how the archive sounds when it becomes a film.'
            : 'The shared events, soundtrack, and account details behind your family archive.'}
        </p>
      </header>

      <nav aria-label="Family settings sections" className="settings-index mb-8 sm:mb-10">
        {isOwner && <SettingsJump href="#family-members">Family</SettingsJump>}
        <SettingsJump href="#events">Events</SettingsJump>
        {isOwner && <SettingsJump href="#guest-links">Guest links</SettingsJump>}
        <SettingsJump href="#soundtrack">Soundtrack</SettingsJump>
        <SettingsJump href="#account">Account</SettingsJump>
      </nav>

      <div className="settings-panels space-y-6">
        {isOwner && (
          <SettingsPanel id="family-members">
            <InviteManager initial={invites} inviteBase={appUrl()} />
          </SettingsPanel>
        )}
        <SettingsPanel id="events">
          <EventManager initial={events} />
        </SettingsPanel>
        {isOwner && (
          <SettingsPanel id="guest-links">
            <UploadLinkManager initial={links} events={events} />
          </SettingsPanel>
        )}
        <SettingsPanel id="soundtrack">
          <MusicManager initial={tracks} />
        </SettingsPanel>

        <section id="account" className="settings-panel scroll-mt-28">
          <p className="eyebrow mb-3">Account</p>
          <h2 className="font-display text-title">Your seat in the archive</h2>
          <p className="mt-3 break-words text-paper-dim">
            Signed in as {session.email}
          </p>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost mt-8">
              Sign out of {appName}
            </button>
          </form>
        </section>
      </div>
    </Shell>
  )
}

function SettingsJump({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="settings-jump">
      {children}
    </a>
  )
}

function SettingsPanel({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="settings-panel scroll-mt-28">
      {children}
    </section>
  )
}
