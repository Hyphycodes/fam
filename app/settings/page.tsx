import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import {
  EventManager,
  InviteManager,
  MusicManager,
  UploadLinkManager,
} from '@/components/FamilyManager'
import { StorageHealth } from '@/components/StorageHealth'
import { MergeEvents } from '@/components/MergeEvents'
import { requireViewer } from '@/lib/viewer'
import { appName, appUrl, isConfigured } from '@/lib/env'
import { getEvents, getInvites, getMusicTracks, getUploadLinks } from '@/lib/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { readDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  if (!isConfigured('supabase')) redirect('/setup')

  const viewer = await requireViewer()
  const db = readDb()
  const isOwner = viewer.role === 'owner'

  const admin = isOwner ? createAdminClient() : null

  const [events, tracks, invites, links] = await Promise.all([
    getEvents(db),
    getMusicTracks(db),
    admin ? getInvites(admin) : Promise.resolve([]),
    admin ? getUploadLinks(admin, appUrl()) : Promise.resolve([]),
  ])

  return (
    <Shell viewer={viewer}>
      <header className="mt-8 mb-10 max-w-3xl sm:mt-14 sm:mb-14">
        <p className="eyebrow">Settings</p>
        <h1 className="mt-3 text-[clamp(2.5rem,8vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-balance">
          {isOwner ? 'Manage Reel' : viewer.display_name}
        </h1>
        <p className="mt-5 max-w-xl leading-relaxed text-paper-dim">
          {isOwner
            ? 'Manage family access, events, upload links, and Movie Mode audio.'
            : 'View shared events, Movie Mode audio, and account details.'}
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
          {isOwner && <MergeEvents events={events.map((event) => ({ id: event.id, name: event.name }))} />}
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
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Your account</h2>
          <p className="mt-3 break-words text-paper-dim">
            Signed in as {viewer.display_name}
          </p>
          <form
            action={viewer.kind === 'member' ? '/api/community/leave' : '/api/auth/signout'}
            method="post"
          >
            <button type="submit" className="btn btn-ghost mt-8">
              Sign out of {appName}
            </button>
          </form>

          {isOwner && (
            <div className="mt-10 border-t border-edge pt-8">
              <p className="eyebrow mb-3">Troubleshooting</p>
              <StorageHealth />
            </div>
          )}
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
