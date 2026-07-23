import { isEmojiOnly } from '@/lib/format'

/**
 * An event's title, with two rules baked in: a title that's entirely emoji
 * ("🏆") renders at display size instead of as a bare little glyph, and a
 * legacy titleless event never renders a blank line.
 *
 * Pass the normal `className` and, optionally, an `emojiClassName` used when the
 * title is all emoji (so the size can jump without a Tailwind class collision).
 */
export function EventTitle({
  name,
  className,
  emojiClassName,
}: {
  name: string
  className: string
  emojiClassName?: string
}) {
  const display = name.trim() || 'Untitled event'
  const emoji = isEmojiOnly(display)
  return <span className={emoji ? (emojiClassName ?? className) : className}>{display}</span>
}
