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
