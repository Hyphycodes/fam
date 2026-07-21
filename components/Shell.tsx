import Link from 'next/link'
import { appName } from '@/lib/env'
import type { Session } from '@/lib/auth'
import { Nav } from '@/components/Nav'

/**
 * The room the app lives in.
 *
 * Navigation sits at the bottom on a phone (thumbs) and floats centred on a
 * laptop. It is deliberately five items and no more — a family archive that
 * needs a menu tree has already lost.
 */
export function Shell({
  session,
  children,
}: {
  session: Session
  children: React.ReactNode
}) {
  return (
    <div className="lamplight relative min-h-dvh">
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 sm:px-6 sm:pt-7">
        <Link href="/" className="group flex min-h-11 items-center" aria-label={`${appName} home`}>
          <span className="osd rgb-split-hover text-[1.65rem] text-paper transition-colors group-hover:text-ember-soft">
            {appName}
          </span>
          <span className="cursor-blink ml-0.5 text-[1.35rem] text-ember" aria-hidden="true">
            ▮
          </span>
        </Link>
        <Link
          href="/settings"
          aria-label={`Open settings for ${session.profile.display_name}`}
          className="flex min-h-11 min-w-11 max-w-[62%] items-center justify-end gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-paper-dim transition-all hover:border-edge hover:bg-ink-raised hover:text-paper sm:px-3"
        >
          <span className="osd grid h-6 w-6 place-items-center rounded-[0.3rem] bg-ember-deep/40 text-sm text-ember-soft">
            {session.profile.display_name.charAt(0).toUpperCase()}
          </span>
          <span className="osd hidden truncate text-base sm:block">
            {session.profile.display_name}
          </span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-36 sm:px-6 sm:pb-40">{children}</main>

      <Nav isOwner={session.profile.role === 'owner'} />
    </div>
  )
}
