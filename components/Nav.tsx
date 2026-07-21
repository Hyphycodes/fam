'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AddMemoriesButton } from '@/components/AddMemories'

/**
 * The dock. Five things and no more — bottom of the screen where thumbs live,
 * floating over the page like a remote control for the archive.
 */
export function Nav({ isOwner }: { isOwner: boolean }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      {/* Fade so content scrolling under the bar doesn't collide with it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink via-ink/85 to-transparent" />

      <div className="relative flex items-center gap-0.5 rounded-full border border-edge bg-ink-raised/90 p-1.5 shadow-[0_18px_60px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <NavLink href="/" label="Home" />
        <NavLink href="/browse" label="Browse" />
        <AddMemoriesButton />
        <NavLink href="/movie" label="Movie" />
        <NavLink href="/settings" label={isOwner ? 'Family' : 'You'} />
      </div>
    </nav>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative rounded-full px-4 py-2.5 text-sm transition-colors sm:px-5 ${
        active
          ? 'text-ember-soft'
          : 'text-paper-soft hover:bg-ink-hover hover:text-paper'
      }`}
    >
      {label}
      {active && (
        <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ember" />
      )}
    </Link>
  )
}
