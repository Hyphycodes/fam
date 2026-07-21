import { Avatar } from '@/components/Avatar'
import type { TaggedPerson } from '@/lib/types'

/**
 * Who's in it — a quiet overlapping stack of faces (or initials), the same
 * shape as the reactor-avatar stack. Meant to sit right on a tile or card, so
 * "who's in it" never requires opening an edit sheet.
 */
export function PeopleStack({
  people,
  size = 20,
  max = 4,
  className = '',
}: {
  people: TaggedPerson[]
  size?: number
  max?: number
  className?: string
}) {
  if (people.length === 0) return null

  const shown = people.slice(0, max)
  const overflow = people.length - shown.length

  return (
    <span
      className={`inline-flex items-center ${className}`}
      title={people.map((p) => p.name).join(', ')}
    >
      <span className="flex -space-x-1.5">
        {shown.map((person) => (
          <Avatar key={person.id} name={person.name} src={person.avatar_url} size={size} ring />
        ))}
      </span>
      {overflow > 0 && (
        <span
          className="meta-mono ml-1.5 flex items-center justify-center rounded-full bg-white/10 px-1.5 text-paper-dim"
          style={{ height: size, lineHeight: `${size}px` }}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}
