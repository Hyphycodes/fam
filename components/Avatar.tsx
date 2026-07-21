/**
 * A member's face, or their initial.
 *
 * Monochrome to the core: no picture means a neutral grey disc with a single
 * letter. Sizes are pixel props so a rail of tiny avatars and a profile-page
 * portrait share one component.
 */
export function Avatar({
  name,
  src,
  size = 32,
  className = '',
  ring = false,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
  /** A hairline ring, for stacks that overlap on a photo. */
  ring?: boolean
}) {
  const initial = (name?.trim()?.charAt(0) || '?').toUpperCase()
  const ringClass = ring ? 'ring-2 ring-ink' : ''

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full object-cover ${ringClass} ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-white/10 font-medium text-paper-soft ${ringClass} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </span>
  )
}
