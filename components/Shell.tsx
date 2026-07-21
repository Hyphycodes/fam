import Link from 'next/link'
import { appName } from '@/lib/env'
import type { Session } from '@/lib/auth'
import { AddMemoriesButton } from '@/components/AddMemories'

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
      <header className="relative z-10 mx-auto flex max-w-5xl items-baseline justify-between px-6 pt-8 pb-2 sm:pt-12">
        <Link href="/" className="group">
          <h1 className="font-display text-3xl tracking-tight text-paper transition-colors group-hover:text-ember">
            {appName}
          </h1>
        </Link>
        <Link
          href="/settings"
          className="text-sm text-paper-dim transition-colors hover:text-paper"
        >
          {session.profile.display_name}
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-40">{children}</main>

      <Nav isOwner={session.profile.role === 'owner'} />
    </div>
  )
}

function Nav({ isOwner }: { isOwner: boolean }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      {/* Fade so content scrolling under the bar doesn't collide with it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink via-ink/85 to-transparent" />

      <div className="relative flex items-center gap-1 rounded-full border border-edge bg-ink-raised/90 p-1.5 shadow-2xl backdrop-blur-xl">
        <NavLink href="/" label="Home" />
        <NavLink href="/browse" label="Browse" />
        <AddMemoriesButton />
        <NavLink href="/movie" label="Movie" />
        <NavLink href={isOwner ? '/settings' : '/browse?tab=people'} label={isOwner ? 'Family' : 'People'} />
      </div>
    </nav>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-2.5 text-sm text-paper-soft transition-colors hover:bg-ink-hover hover:text-paper sm:px-5"
    >
      {label}
    </Link>
  )
}
