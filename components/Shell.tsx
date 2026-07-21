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
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 pt-7 pb-2">
        <Link href="/" className="group flex items-baseline gap-1">
          <span className="font-display text-2xl tracking-tight text-paper italic transition-colors group-hover:text-ember">
            {appName}
          </span>
          <span className="text-ember">.</span>
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-full border border-transparent px-3 py-1.5 text-sm text-paper-dim transition-all hover:border-edge hover:bg-ink-raised hover:text-paper"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ember-deep/40 font-display text-xs text-ember-soft">
            {session.profile.display_name.charAt(0).toUpperCase()}
          </span>
          {session.profile.display_name}
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-40">{children}</main>

      <Nav isOwner={session.profile.role === 'owner'} />
    </div>
  )
}
