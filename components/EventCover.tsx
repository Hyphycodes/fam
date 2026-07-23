/**
 * An event's cover, with the guarantee that it is never a grey square.
 *
 * The resolution chain (explicit cover → flyer → first media by capture date) is
 * done in the data layer per surface, for batching; this component is the one
 * shared *fallback*: when nothing resolved, it draws the title as intentional
 * typography over a hue derived from the name — the space's own background
 * treatment, not a placeholder with an icon.
 */
export function EventCover({
  src,
  name,
  className = '',
}: {
  src: string | null
  name: string
  className?: string
}) {
  if (src) {
    return <img src={src} alt="" loading="lazy" decoding="async" className={className} />
  }

  const hue = hueFromName(name)
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(150deg, hsl(${hue} 38% 20%), hsl(${(hue + 45) % 360} 32% 11%))`,
      }}
    >
      <span className="max-w-[85%] text-center font-display text-lg leading-tight text-white/90 sm:text-xl">
        {name}
      </span>
    </span>
  )
}

function hueFromName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360
  }
  return hash
}
