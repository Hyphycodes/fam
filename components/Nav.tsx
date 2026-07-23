'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AddMemoriesButton } from '@/components/AddMemories'

type DockIcon = 'home' | 'browse' | 'board' | 'you'

/** A quiet dock, sized for thumbs and safe areas. State is brightness. */
export function Nav() {
  return (
    <nav
      aria-label="Primary navigation"
      className="archive-dock fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-5"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink via-ink/85 to-transparent" />

      <div className="relative flex items-center gap-0.5 rounded-full border border-white/10 bg-[#141414]/92 p-1.5 shadow-[0_18px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <NavLink href="/" label="Home" icon="home" />
        <NavLink
          href="/browse"
          label="Browse"
          icon="browse"
          activePrefixes={['/browse', '/albums', '/collection']}
        />
        <AddMemoriesButton />
        <NavLink href="/community" label="Board" icon="board" />
        <NavLink href="/you" label="You" icon="you" />
      </div>
    </nav>
  )
}

function NavLink({
  href,
  label,
  icon,
  activePrefixes,
}: {
  href: string
  label: string
  icon: DockIcon
  activePrefixes?: string[]
}) {
  const pathname = usePathname()
  const active =
    href === '/'
      ? pathname === '/'
      : (activePrefixes ?? [href]).some((prefix) => pathname.startsWith(prefix))

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`dock-link relative flex min-h-14 w-[3.55rem] flex-col items-center justify-center gap-1 rounded-full text-[10px] font-medium transition-all sm:w-[4.35rem] ${
        active ? 'text-white' : 'text-paper-faint hover:text-paper-soft active:scale-[0.97]'
      }`}
    >
      <DockGlyph icon={icon} bold={active} />
      <span>{label}</span>
    </Link>
  )
}

function DockGlyph({ icon, bold }: { icon: DockIcon; bold: boolean }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: bold ? 2 : 1.5,
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
  if (icon === 'board') {
    return (
      <svg {...common}>
        <rect x="3.75" y="4.75" width="16.5" height="15.5" rx="2" />
        <path d="M3.75 9h16.5M8 3.5v3M16 3.5v3" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M5.5 19.5c.5-3.4 3-5 6.5-5s6 1.6 6.5 5" />
    </svg>
  )
}
