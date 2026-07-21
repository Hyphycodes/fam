import Link from 'next/link'
import { appName } from '@/lib/env'
import type { Viewer } from '@/lib/types'
import { Nav } from '@/components/Nav'
import { Avatar } from '@/components/Avatar'

/**
 * The room the app lives in.
 *
 * Chrome is deliberately near-invisible: a wordmark, an avatar, and a
 * five-item dock. With `immersive` the header floats over the page's own
 * imagery (the home billboard) instead of taking up space above it.
 */
export function Shell({
  viewer,
  immersive = false,
  children,
}: {
  viewer: Viewer
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
          href="/you"
          aria-label={`You — ${viewer.display_name}`}
          className="flex min-h-11 min-w-11 max-w-[62%] items-center justify-end gap-2.5 rounded-full px-1.5 py-1.5 text-sm text-paper-dim transition-colors hover:text-paper"
        >
          <span className="hidden truncate text-[0.8125rem] sm:block">
            {viewer.display_name}
          </span>
          <Avatar name={viewer.display_name} src={viewer.avatar_url} size={32} />
        </Link>
      </header>

      <main
        className={`relative z-10 mx-auto max-w-5xl px-5 pb-36 sm:px-6 sm:pb-40 ${
          immersive ? '' : 'pt-2'
        }`}
      >
        {children}
      </main>

      <Nav />
    </div>
  )
}
