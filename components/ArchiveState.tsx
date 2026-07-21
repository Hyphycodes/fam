import Link from 'next/link'
import { appName } from '@/lib/env'

export function ArchiveState({
  eyebrow,
  title,
  message,
  action,
}: {
  eyebrow: string
  title: string
  message: string
  action?: { href: string; label: string }
}) {
  return (
    <main className="lamplight relative grid min-h-dvh place-items-center overflow-hidden px-6 py-20">
      <div className="relative w-full max-w-2xl border-y border-edge py-14 text-center sm:py-20">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-5 font-display text-[clamp(3.25rem,10vw,6.5rem)] leading-[0.88] tracking-[-0.035em] text-balance">
          {title}
        </h1>
        <p className="mx-auto mt-7 max-w-lg text-base leading-relaxed text-paper-dim sm:text-lg">
          {message}
        </p>
        {action && (
          <Link href={action.href} className="btn btn-ghost mt-9">
            {action.label}
          </Link>
        )}
        <p className="mt-12 font-display text-xl italic text-paper-faint">
          {appName}<span className="text-ember">.</span>
        </p>
      </div>
    </main>
  )
}
