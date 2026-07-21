import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { warmDate } from '@/lib/format'
import type { ActivityItem } from '@/lib/community/activity'

/**
 * "Recently in the family" — a quiet horizontal strip of the last few things
 * that happened, so opening the app feels like walking into a room where people
 * have been. Chips scroll like any rail; each is a face, a line, a time.
 */
export function ActivityStrip({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null

  return (
    <section>
      <h2 className="mb-2.5 text-[0.9375rem] font-medium tracking-[-0.01em] text-paper-soft">
        Lately
      </h2>
      <div className="rail">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex w-[15rem] items-center gap-2.5 rounded-xl border border-edge bg-ink-raised px-3 py-2.5 transition-colors hover:border-edge-strong hover:bg-ink-hover"
          >
            <Avatar name={item.actor_name} src={item.actor_avatar_url} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] leading-tight text-paper">
                <span className="font-medium">{item.actor_name}</span>{' '}
                <span className="text-paper-dim">{item.verb}</span>
              </span>
              <span className="meta-mono">{warmDate(item.created_at)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
