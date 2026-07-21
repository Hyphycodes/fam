import Link from 'next/link'
import { appName } from '@/lib/env'
import type { Session } from '@/lib/auth'
import { Nav } from '@/components/Nav'

/**
 * The room the app lives in.
 *
 * Chrome is deliberately near-invisible: a wordmark, an avatar, and a
 * five-item dock. With `immersive` the header floats over the page's own
 * imagery (the home billboard) instead of taking up space above it.
 */
export function Shell({
  session,
  immersive = false,
  children,
}: {
  session: Session
  immersive?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-dvh">
      <header
        className={`${
          immersive ? 'absolute inset-x-0 top-0' : 'relative'
        } z-20 mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 pt-[max(1.1rem,env(safe-area-inset-top))] pb-2 sm:px-6 sm:pt-6`}
      >
        <Link
          href="/"
          className="flex min-h-11 items-center text-lg font-semibold tracking-[-0.02em] text-white transition-opacity hover:opacity-80"
          aria-label={`${appName} home`}
        >
          {appName}
        </Link>
        <Link
          href="/settings"
          aria-label={`Open settings for ${session.profile.display_name}`}
          className="flex min-h-11 min-w-11 max-w-[62%] items-center justify-end gap-2.5 rounded-full px-1.5 py-1.5 text-sm text-paper-dim transition-colors hover:text-paper"
        >
          <span className="hidden truncate text-[0.8125rem] sm:block">
            {session.profile.display_name}
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/10 text-[0.8125rem] font-medium text-white backdrop-blur-sm">
            {session.profile.display_name.charAt(0).toUpperCase()}
          </span>
        </Link>
      </header>

      <main
        className={`relative z-10 mx-auto max-w-5xl px-5 pb-36 sm:px-6 sm:pb-40 ${
          immersive ? '' : 'pt-2'
        }`}
      >
        {children}
      </main>

      <Nav isOwner={session.profile.role === 'owner'} />
    </div>
  )
}
