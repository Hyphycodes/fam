/**
 * Dates, said the way a person would say them.
 *
 * "Two weeks ago" and "Summer 2019" belong in a family archive. "2019-07-04
 * 18:30:00Z" does not.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTHS_ABBR = MONTHS.map((month) => month.slice(0, 3))

/**
 * How sure we are of a capture date, and therefore how much of it we're allowed
 * to show. A `year`-precision date must never render a month, a day, or a time —
 * that would be a fake date dressed up as a real one.
 */
export type CapturePrecision = 'exact' | 'day' | 'month' | 'year'
export type CaptureSource = 'exif' | 'user' | 'inherited' | 'upload_fallback'

export const CAPTURE_PRECISIONS: readonly CapturePrecision[] = ['exact', 'day', 'month', 'year']
export const CAPTURE_SOURCES: readonly CaptureSource[] = ['exif', 'user', 'inherited', 'upload_fallback']

export function isCapturePrecision(value: unknown): value is CapturePrecision {
  return typeof value === 'string' && (CAPTURE_PRECISIONS as readonly string[]).includes(value)
}

export function isCaptureSource(value: unknown): value is CaptureSource {
  return typeof value === 'string' && (CAPTURE_SOURCES as readonly string[]).includes(value)
}

/**
 * The one place a capture date turns into words. Every surface that shows when a
 * memory was taken goes through here, so precision is honoured everywhere at
 * once instead of each component re-deciding.
 *
 *   exact  → "Jun 18, 2023 · 8:24 PM"
 *   day    → "Jun 18, 2023"
 *   month  → "November 2006"
 *   year   → "1998"
 *
 * `style: 'osd'` is the camcorder burn-in variant ("NOV 12 2006") used on tiles;
 * it degrades the same way (a year-only date shows just "1998"). A missing
 * precision is treated as `day` — the safe, time-free default — so this stays
 * correct even against a row that predates the precision column.
 */
export function formatCapturedAt(
  input: string | Date,
  precision?: CapturePrecision | null,
  opts?: { style?: 'warm' | 'osd' },
): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return ''

  const p = precision ?? 'day'
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()

  if (opts?.style === 'osd') {
    if (p === 'year') return String(year)
    if (p === 'month') return `${MONTHS_ABBR[month].toUpperCase()} ${year}`
    return `${MONTHS_ABBR[month].toUpperCase()} ${day} ${year}`
  }

  if (p === 'year') return String(year)
  if (p === 'month') return `${MONTHS[month]} ${year}`
  if (p === 'exact') {
    let hour = date.getHours()
    const minute = date.getMinutes()
    const meridiem = hour < 12 ? 'AM' : 'PM'
    hour = hour % 12 || 12
    return `${MONTHS_ABBR[month]} ${day}, ${year} · ${hour}:${String(minute).padStart(2, '0')} ${meridiem}`
  }
  return `${MONTHS_ABBR[month]} ${day}, ${year}`
}

/**
 * Turn a chosen precision + date parts into the timestamp we store.
 *
 * Low-precision dates are anchored to the *middle* of their span — the 15th for
 * a month, July 1 for a year, noon for a day — so they sort sensibly and never
 * clump at a boundary reading as false precision. Computed in the caller's local
 * zone (the person picking the date), matching how the app already stores
 * user-entered dates at noon local. `month` is 0-indexed, like `Date`.
 */
export function anchorCapturedAt(
  precision: CapturePrecision,
  parts: { year: number; month?: number; day?: number; hour?: number; minute?: number },
): Date {
  const { year, month = 0, day = 1, hour = 12, minute = 0 } = parts
  if (precision === 'year') return new Date(year, 6, 1, 12, 0, 0, 0)
  if (precision === 'month') return new Date(year, month, 15, 12, 0, 0, 0)
  if (precision === 'day') return new Date(year, month, day, 12, 0, 0, 0)
  return new Date(year, month, day, hour, minute, 0, 0)
}

export function warmDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)

  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'Last week'
  if (days < 35) return `${Math.round(days / 7)} weeks ago`
  if (days < 365) return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`

  const years = Math.round(days / 365)
  if (years === 1) return 'A year ago'
  if (years < 8) return `${years} years ago`
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * The feed's warm, relative label — but honest about soft dates. A recent memory
 * still reads "2 weeks ago"; a year-only memory reads "1998" instead of letting
 * `warmDate` invent a month ("July 1998") it never actually knew.
 */
export function warmCapturedAt(input: string | Date, precision?: CapturePrecision | null): string {
  if (precision === 'year') return formatCapturedAt(input, 'year')
  return warmDate(input)
}

/** The date the way a camcorder burned it into the corner: "NOV 12 2006". */
export function osdDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return ''
  const month = MONTHS[date.getMonth()].slice(0, 3).toUpperCase()
  return `${month} ${date.getDate()} ${date.getFullYear()}`
}

export function fullDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return ''
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/** The season a date falls in, for title cards: "Summer 2019". */
export function season(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return ''
  const month = date.getMonth()
  const name =
    month <= 1 || month === 11 ? 'Winter'
    : month <= 4 ? 'Spring'
    : month <= 7 ? 'Summer'
    : 'Fall'
  return `${name} ${date.getFullYear()}`
}

/** Did this happen in the last `withinMs`? Kept out of components so the clock
 *  is never read during render. */
export function isRecent(input: string | Date, withinMs: number): boolean {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() < withinMs
}

/** An index that changes once a day — rotates a daily featured pick. Lives
 *  here so the clock is never read during render. */
export function dailyIndex(length: number): number {
  if (length <= 0) return 0
  const now = new Date()
  const start = Date.UTC(now.getUTCFullYear(), 0, 0)
  return Math.floor((now.getTime() - start) / 86_400_000) % length
}

export function yearsAgo(input: string | Date): number {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Date().getFullYear() - date.getFullYear()
}

export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export function duration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return ''
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * A title made entirely of emoji ("🏆") — rendered at display size in the slot
 * a text title would occupy, rather than as a bare little glyph. Allows the
 * joiners and variation selectors that compose emoji (ZWJ, U+FE0F) plus
 * whitespace; anything with a letter or digit is a normal title.
 */
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\u200d\uFE0F\s]+$/u
export function isEmojiOnly(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && EMOJI_ONLY.test(trimmed)
}

/**
 * A CSS `object-position` from a media focal point (0..1), for any box that
 * crops a cover. Defaults to dead-center, so a row without a real focal point
 * behaves exactly as center-crop did.
 */
export function focalPosition(focal: {
  focal_x?: number | null
  focal_y?: number | null
}): string {
  const clamp = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5
  return `${clamp(focal.focal_x) * 100}% ${clamp(focal.focal_y) * 100}%`
}

/** "Mom, Dad and 2 others" */
export function nameList(names: string[], max = 2): string {
  if (names.length === 0) return ''
  if (names.length <= max) {
    return names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }
  const rest = names.length - max
  return `${names.slice(0, max).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`
}
