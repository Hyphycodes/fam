'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AddMemoriesButton } from '@/components/AddMemories'

type DockIcon = 'home' | 'browse' | 'movie' | 'family'

/** A quiet remote control for the archive, sized for thumbs and safe areas. */
export function Nav({ isOwner }: { isOwner: boolean }) {
  return (
    <nav
      aria-label="Primary navigation"
      className="archive-dock fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-5"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink via-ink/92 to-transparent" />

      <div className="relative flex items-center gap-0.5 rounded-[0.9rem] border border-edge-strong bg-ink-raised/94 p-1.5 shadow-[0_18px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <NavLink href="/" label="Home" icon="home" />
        <NavLink href="/browse" label="Browse" icon="browse" />
        <AddMemoriesButton />
        <NavLink href="/movie" label="Movie" icon="movie" />
        <NavLink href="/settings" label={isOwner ? 'Family' : 'You'} icon="family" />
      </div>
    </nav>
  )
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: DockIcon }) {
  const pathname = usePathname()
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`dock-link relative flex min-h-14 w-[3.55rem] flex-col items-center justify-center gap-0.5 rounded-[0.6rem] transition-all sm:w-[4.35rem] ${
        active
          ? 'bg-ink-hover text-ember-soft'
          : 'text-paper-dim hover:bg-ink-hover hover:text-paper active:scale-[0.97]'
      }`}
    >
      <DockGlyph icon={icon} />
      <span className="osd text-[0.8rem] leading-none">{label}</span>
      {active && (
        <span
          className="absolute bottom-1 h-0.5 w-3 rounded-full bg-ember shadow-[0_0_8px_rgba(255,180,94,0.9)]"
          aria-hidden="true"
        />
      )}
    </Link>
  )
}

function DockGlyph({ icon }: { icon: DockIcon }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (icon === 'home') {
    return (
      <svg {...common}>
        <path d="M4.5 10.5 12 4l7.5 6.5v8.75H14v-5.5h-4v5.5H4.5z" />
      </svg>
    )
  }
  if (icon === 'browse') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.25" />
        <path d="m14.9 8.6-1.8 4.5-4.5 1.8 1.8-4.5z" />
      </svg>
    )
  }
  if (icon === 'movie') {
    return (
      <svg {...common}>
        <rect x="3.75" y="5" width="16.5" height="14" rx="2" />
        <path d="m10 9 5 3-5 3z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.25" />
      <path d="M3.75 19c.4-3.15 2.15-4.75 5.25-4.75s4.85 1.6 5.25 4.75M14 15.2c2.95-.55 5.1.7 5.75 3.8" />
    </svg>
  )
}
