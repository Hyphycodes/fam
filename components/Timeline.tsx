'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { duration, focalPosition, formatCapturedAt, fullDate, isEmojiOnly } from '@/lib/format'
import { EventCover } from '@/components/EventCover'
import type { MediaView } from '@/lib/types'
import type { MonthCount, TimelineArtifact, TimelineCursor, TimelineEvent } from '@/lib/timeline'

/**
 * The Timeline — one continuous scroll through the whole archive, ordered by
 * capture date, reading like a history rather than a dump.
 *
 * The rule: an item appears exactly once. Media that belongs to a completed
 * event lives *inside that event's card* (collapsed by default, one tap from its
 * full grid); media that belongs to nothing is loose in the month grid. A month
 * never shows more than a screenful loose — the rest is one "Show all" away.
 *
 * Performance is built for tens of thousands of items: keyset pagination on
 * (taken_at, id), month sections use CSS `content-visibility` so off-screen
 * months aren't laid out or painted, images lazy-load into fixed-aspect boxes
 * (no layout shift), and the year scrubber's list comes from a grouped count,
 * never from the rows themselves.
 */

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MAX_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PAGE = 48
/** How many loose items a month shows before "Show all N" — legibility over exhaustiveness. */
const MONTH_CAP = 12
/** Above this many years with content, the scrubber groups into decades. */
const FLAT_YEARS = 12

/** An event as it sits in the timeline: its own card, its media folded inside. */
interface TimelineEventCard {
  id: string
  name: string
  cover: string | null
  count: number
  preview: string[]
  date: string
}

interface MonthGroup {
  year: number
  month: number
  band: MediaView[] // month-precision items — surfaced at the top of the month
  grid: MediaView[]
  events: TimelineEventCard[]
  artifacts: TimelineArtifact[]
}
interface YearGroup {
  year: number
  band: MediaView[] // year-precision items — surfaced at the top of the year
  months: MonthGroup[]
}

/** Placement parse (UTC noon), so an event lands in the same month bucket the
 *  DB's generated taken_* columns would put media of that day in. */
function placeDate(value: string): Date {
  return new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
}
/** Display parse (local noon), so a date-only value never drifts a day. */
function showDate(value: string): Date {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value)
}

// Expansion is remembered for the session so collapsing something doesn't undo
// itself on the next render (a refresh, a filter change, a jump). A tiny
// external store keeps every card in sync; useSyncExternalStore gives SSR a
// stable "collapsed" snapshot, so restoring open state is mismatch-free.
const OPEN_KEY = 'timeline:open-events'

function loadOpenEvents(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const openStore = {
  ids: null as Set<string> | null,
  listeners: new Set<() => void>(),
  ensure(): Set<string> {
    if (!this.ids) this.ids = loadOpenEvents()
    return this.ids
  },
  has(id: string): boolean {
    return this.ensure().has(id)
  },
  set(id: string, on: boolean): void {
    const ids = this.ensure()
    if (on) ids.add(id)
    else ids.delete(id)
    try {
      sessionStorage.setItem(OPEN_KEY, JSON.stringify([...ids]))
    } catch {
      // A private-mode sessionStorage can throw; expansion just won't persist.
    }
    for (const listener of this.listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
}

function useEventOpen(id: string): [boolean, () => void] {
  const open = useSyncExternalStore(
    (onChange) => openStore.subscribe(onChange),
    () => openStore.has(id),
    () => false,
  )
  const toggle = useCallback(() => openStore.set(id, !openStore.has(id)), [id])
  return [open, toggle]
}

/** Group loose media (nothing that belongs to a completed event) into years and
 *  months. Event cards are woven in separately by groupWithEvents. */
function group(media: MediaView[]): YearGroup[] {
  const years = new Map<number, YearGroup>()
  for (const item of media) {
    let yg = years.get(item.taken_year)
    if (!yg) {
      yg = { year: item.taken_year, band: [], months: [] }
      years.set(item.taken_year, yg)
    }
    if (item.taken_precision === 'year') {
      yg.band.push(item)
      continue
    }
    let mg = yg.months.find((m) => m.month === item.taken_month)
    if (!mg) {
      mg = { year: item.taken_year, month: item.taken_month, band: [], grid: [], events: [], artifacts: [] }
      yg.months.push(mg)
    }
    if (item.taken_precision === 'month') mg.band.push(item)
    else mg.grid.push(item)
  }
  for (const yg of years.values()) yg.months.sort((a, b) => b.month - a.month)
  return [...years.values()].sort((a, b) => b.year - a.year)
}

/**
 * Weave completed events (and dated artifacts) into the timeline. Media that
 * belongs to one of those events is pulled out of the loose grid entirely — it
 * appears only inside its card — so nothing renders twice. An event whose media
 * hasn't scrolled into view yet still waits (chronological order), unless it has
 * loaded media that needs a home right now, or we've loaded everything.
 */
function groupWithEvents(
  media: MediaView[],
  events: TimelineEvent[],
  artifacts: TimelineArtifact[],
  done: boolean,
): YearGroup[] {
  const eventIds = new Set(events.map((e) => e.id))
  const loose: MediaView[] = []
  const loaded = new Set<string>()
  for (const item of media) {
    if (item.event_id && eventIds.has(item.event_id)) {
      loaded.add(item.event_id)
      continue // belongs to an event → shown only inside that event's card
    }
    loose.push(item)
  }

  const years = group(loose)
  if (events.length === 0 && artifacts.length === 0) return years

  const oldest = media.length ? new Date(media[media.length - 1].taken_at).getTime() : null
  const byYear = new Map(years.map((yg) => [yg.year, yg]))

  const gated = (dateStr: string, hasLoaded: boolean): boolean => {
    if (done || oldest === null || hasLoaded) return false
    const at = placeDate(dateStr).getTime()
    return Number.isNaN(at) ? false : at < oldest // older than everything loaded → wait
  }

  const monthFor = (dateStr: string): MonthGroup | null => {
    const at = placeDate(dateStr)
    if (Number.isNaN(at.getTime())) return null
    const year = at.getUTCFullYear()
    const month = at.getUTCMonth() + 1
    let yg = byYear.get(year)
    if (!yg) {
      yg = { year, band: [], months: [] }
      byYear.set(year, yg)
    }
    let mg = yg.months.find((m) => m.month === month)
    if (!mg) {
      mg = { year, month, band: [], grid: [], events: [], artifacts: [] }
      yg.months.push(mg)
    }
    return mg
  }

  for (const event of events) {
    if (gated(event.date, loaded.has(event.id))) continue
    const mg = monthFor(event.date)
    if (!mg || mg.events.some((e) => e.id === event.id)) continue
    mg.events.push({
      id: event.id,
      name: event.name,
      cover: event.cover_url,
      count: event.count,
      preview: event.preview,
      date: event.date,
    })
  }

  for (const artifact of artifacts) {
    if (gated(artifact.date, false)) continue
    const mg = monthFor(artifact.date)
    if (mg) mg.artifacts.push(artifact)
  }

  const merged = [...byYear.values()].sort((a, b) => b.year - a.year)
  for (const yg of merged) yg.months.sort((a, b) => b.month - a.month)
  return merged
}

export function Timeline({
  initialMedia,
  initialCursor,
  monthCounts,
  events,
  artifacts,
  people,
  initialType = null,
}: {
  initialMedia: MediaView[]
  initialCursor: TimelineCursor | null
  monthCounts: MonthCount[]
  events: TimelineEvent[]
  artifacts: TimelineArtifact[]
  people: { id: string; name: string }[]
  initialType?: 'photo' | 'video' | null
}) {
  const [media, setMedia] = useState(initialMedia)
  const [cursor, setCursor] = useState<TimelineCursor | null>(initialCursor)
  const [done, setDone] = useState(initialCursor === null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'photo' | 'video' | null>(initialType)
  const [personId, setPersonId] = useState<string | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)

  const filtered = type !== null || personId !== null
  // Events only belong in the unfiltered view — a person/type filter is about
  // media, so a filtered view shows every matching frame loose.
  const groups = useMemo(
    () => (filtered ? group(media) : groupWithEvents(media, events, artifacts, done)),
    [media, events, artifacts, done, filtered],
  )

  // Years with content, newest first — the scrubber's source. Comes from the
  // grouped count so it's complete before the matching rows have loaded.
  const railYears = useMemo(() => {
    const set = new Set<number>()
    for (const bucket of monthCounts) if (bucket.count > 0) set.add(bucket.year)
    return [...set].sort((a, b) => b - a)
  }, [monthCounts])

  const fetchPage = useCallback(
    async (opts: { cursor: TimelineCursor | null; replace: boolean }) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (opts.cursor) {
          params.set('before', opts.cursor.takenAt)
          params.set('beforeId', opts.cursor.id)
        }
        if (type) params.set('type', type)
        if (personId) params.set('person', personId)
        params.set('limit', String(PAGE))
        const response = await fetch(`/api/timeline?${params.toString()}`)
        const payload = (await response.json()) as {
          media?: MediaView[]
          nextCursor?: TimelineCursor | null
          error?: string
        }
        if (!response.ok) throw new Error(payload.error || 'Could not load the timeline.')
        const next = payload.media ?? []
        setMedia((prev) => (opts.replace ? next : [...prev, ...next]))
        setCursor(payload.nextCursor ?? null)
        setDone(!payload.nextCursor)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load the timeline.')
      } finally {
        setLoading(false)
      }
    },
    [type, personId],
  )

  // Re-anchor the whole list whenever a filter changes — but never on first mount
  // (the server already handed us the unfiltered first page).
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    void fetchPage({ cursor: null, replace: true })
  }, [type, personId, fetchPage])

  const topRef = useRef<HTMLDivElement | null>(null)
  const jumpToYear = useCallback(
    (year: number) => {
      void fetchPage({
        cursor: { takenAt: new Date(Date.UTC(year + 1, 0, 1)).toISOString(), id: MAX_ID },
        replace: true,
      })
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [fetchPage],
  )

  // Infinite scroll: load the next (older) page when the sentinel nears the view.
  const sentinel = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !done && cursor) {
          void fetchPage({ cursor, replace: false })
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, loading, done, fetchPage])

  // Mark the year the reader is currently passing, so the scrubber shows position.
  const yearRefs = useRef(new Map<number, HTMLElement>())
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        let best: number | null = null
        let bestTop = Number.POSITIVE_INFINITY
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const year = Number((entry.target as HTMLElement).dataset.year)
          if (entry.boundingClientRect.top < bestTop) {
            bestTop = entry.boundingClientRect.top
            best = year
          }
        }
        if (best !== null) setActiveYear(best)
      },
      { rootMargin: '-56px 0px -80% 0px', threshold: 0 },
    )
    for (const node of yearRefs.current.values()) observer.observe(node)
    return () => observer.disconnect()
  }, [groups])

  return (
    <div ref={topRef} className="pt-2">
      <header className="mb-3">
        <p className="eyebrow mb-1">The family, in order</p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Timeline</h1>
      </header>

      <div className="sticky top-0 z-30 -mx-5 border-b border-edge/70 bg-ink/92 px-5 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Media type">
            {(
              [
                ['All', null],
                ['Photos', 'photo'],
                ['Videos', 'video'],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  type === value
                    ? 'border-white/70 bg-white/10 text-paper'
                    : 'border-edge text-paper-dim hover:bg-ink-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {people.length > 0 && (
            <select
              value={personId ?? ''}
              onChange={(event) => setPersonId(event.target.value || null)}
              aria-label="Filter by person"
              className="field h-9 w-auto max-w-[45%] py-0 text-sm tracking-normal normal-case"
            >
              <option value="">Everyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {railYears.length > 1 && (
        <Scrubber years={railYears} activeYear={activeYear} onJump={jumpToYear} />
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/25 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      {groups.length === 0 && !loading ? (
        <div className="mt-10 rounded-2xl border border-dashed border-edge px-6 py-16 text-center">
          <p className="text-paper-soft">
            {filtered ? 'Nothing matches that filter yet.' : 'The timeline is empty for now.'}
          </p>
          <p className="mt-1 text-sm text-paper-faint">
            {filtered ? 'Try a different filter.' : 'Add memories and they’ll appear here in order.'}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {groups.map((yg) => (
            <section
              key={yg.year}
              aria-label={String(yg.year)}
              data-year={yg.year}
              ref={(node) => {
                if (node) yearRefs.current.set(yg.year, node)
                else yearRefs.current.delete(yg.year)
              }}
            >
              <div className="sticky top-14 z-20 -mx-5 overflow-hidden sm:-mx-6">
                <YearMosaic urls={yearMosaic(yg)} />
                <div className="relative flex items-center justify-between gap-3 px-5 py-3 pr-10 sm:px-6 sm:pr-11">
                  <h2 className="font-display text-3xl tracking-[-0.02em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
                    {yg.year}
                  </h2>
                  {(yg.band.length > 0 || yg.months.some((m) => m.grid.length + m.band.length > 0)) && (
                    <Link
                      href={`/movie?source=year&year=${yg.year}&mode=full`}
                      className="shrink-0 rounded-full border border-white/25 bg-black/30 px-3 py-1 text-xs text-white/90 backdrop-blur-sm transition-colors hover:border-white/50 hover:text-white"
                    >
                      ▸ Play {yg.year}
                    </Link>
                  )}
                </div>
              </div>

              <div className="pr-10 sm:pr-11">
                {yg.band.length > 0 && (
                  <ApproximateBand label={`${yg.year} · dates approximate`} items={yg.band} />
                )}
                {yg.months.map((mg) => (
                  <MonthSection key={`${mg.year}-${mg.month}`} mg={mg} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {loading && <p className="py-8 text-center text-sm text-paper-faint">Loading…</p>}
      {done && groups.length > 0 && (
        <p className="py-8 text-center text-xs text-paper-faint">The beginning.</p>
      )}
    </div>
  )
}

/** A month's content. The default view is a browsable rail of big cards —
 *  event cards and soft-dated bands always show in full; only the loose photo
 *  rail is capped, and "Show all" trades it for a proper grid rather than an
 *  endless scroll. */
function MonthSection({ mg }: { mg: MonthGroup }) {
  const [showAll, setShowAll] = useState(false)
  const overflowing = mg.grid.length > MONTH_CAP
  const grid = showAll ? mg.grid : mg.grid.slice(0, MONTH_CAP)

  return (
    <section
      aria-label={`${MONTHS[mg.month]} ${mg.year}`}
      // `auto` lets the browser remember a month's real rendered height, so
      // expanding a card (or scrolling it off-screen while open) never shifts
      // the rows below it. The estimate is only the first-paint placeholder.
      style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${estimateHeight(mg)}px` }}
    >
      <h3 className="mt-8 mb-4 text-sm font-medium tracking-[0.14em] text-paper-dim uppercase">
        {MONTHS[mg.month]}
      </h3>

      {mg.events.length > 0 && (
        <div className="flex flex-col gap-3">
          {mg.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {mg.artifacts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {mg.artifacts.map((artifact) => (
            <ArtifactChip key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}

      {mg.band.length > 0 && (
        <ApproximateBand label={`${MONTHS[mg.month]} ${mg.year} · approximate`} items={mg.band} />
      )}

      {grid.length > 0 &&
        (showAll ? (
          <Grid>
            {grid.map((item) => (
              <Tile key={item.id} media={item} />
            ))}
          </Grid>
        ) : (
          <PhotoRail items={grid} />
        ))}

      {overflowing && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-3 w-full rounded-lg border border-edge py-2 text-sm text-paper-dim transition-colors hover:border-edge-strong hover:text-paper"
        >
          {showAll ? 'Show less' : `Show all ${mg.grid.length}`}
        </button>
      )}
    </section>
  )
}

/** The persistent year scrubber — a thin right rail, not a header row. Shows the
 *  years that have content (grouped into decades once there are too many to
 *  list), marks where you are, and jumps. */
function Scrubber({
  years,
  activeYear,
  onJump,
}: {
  years: number[]
  activeYear: number | null
  onJump: (year: number) => void
}) {
  const [openDecade, setOpenDecade] = useState<number | null>(null)
  const decades = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const year of years) {
      const decade = Math.floor(year / 10) * 10
      map.set(decade, [...(map.get(decade) ?? []), year])
    }
    return [...map.entries()]
      .map(([decade, list]) => ({ decade, years: list.sort((a, b) => b - a) }))
      .sort((a, b) => b.decade - a.decade)
  }, [years])

  const flat = years.length <= FLAT_YEARS
  const activeDecade = activeYear !== null ? Math.floor(activeYear / 10) * 10 : null

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div className="relative mx-auto h-full max-w-5xl">
        <nav
          aria-label="Jump to a year"
          className="hide-scrollbar pointer-events-auto absolute top-1/2 right-2 flex max-h-[68vh] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto rounded-full border border-edge bg-ink/90 px-1 py-2 shadow-lg shadow-black/30 backdrop-blur"
        >
          {flat
            ? years.map((year) => (
                <YearChip key={year} year={year} active={year === activeYear} onJump={onJump} />
              ))
            : decades.map(({ decade, years: list }) => {
                const shown = (openDecade ?? activeDecade) === decade
                return (
                  <div key={decade} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setOpenDecade((current) => (current === decade ? null : decade))}
                      aria-expanded={shown}
                      className={`rounded-full px-1.5 text-center text-[10px] tabular-nums transition-colors ${
                        decade === activeDecade ? 'font-semibold text-paper' : 'text-paper-faint hover:text-paper'
                      }`}
                      style={{ minHeight: '1.15rem', lineHeight: '1.15rem' }}
                    >
                      {String(decade).slice(2)}s
                    </button>
                    {shown &&
                      list.map((year) => (
                        <YearChip key={year} year={year} active={year === activeYear} small onJump={onJump} />
                      ))}
                  </div>
                )
              })}
        </nav>
      </div>
    </div>
  )
}

function YearChip({
  year,
  active,
  small,
  onJump,
}: {
  year: number
  active: boolean
  small?: boolean
  onJump: (year: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onJump(year)}
      aria-current={active ? 'true' : undefined}
      title={String(year)}
      className={`rounded-full text-center tabular-nums transition-colors ${
        small ? 'px-1 text-[9px]' : 'px-1.5 text-[10px]'
      } ${active ? 'bg-white/15 font-semibold text-paper' : 'text-paper-faint hover:text-paper'}`}
      style={{ minHeight: '1.15rem', lineHeight: '1.15rem' }}
    >
      &rsquo;{String(year).slice(2)}
    </button>
  )
}

function estimateHeight(mg: MonthGroup): number {
  const hasPhotos = mg.grid.length > 0 || mg.band.length > 0
  return 60 + mg.events.length * 260 + (mg.artifacts.length ? 48 : 0) + (hasPhotos ? 220 : 0)
}

/** Up to four thumbnails from a year's already-loaded content — the year
 *  header's cover band. Pulled from grids, event previews, and bands, so a year
 *  looks like a year and it costs no extra request. */
function yearMosaic(yg: YearGroup): string[] {
  const urls: string[] = []
  const push = (url?: string | null) => {
    if (url && urls.length < 4 && !urls.includes(url)) urls.push(url)
  }
  for (const item of yg.band) push(item.thumb_url ?? item.display_url)
  for (const mg of yg.months) {
    for (const item of mg.grid) push(item.thumb_url ?? item.display_url)
    for (const event of mg.events) for (const preview of event.preview) push(preview)
    for (const item of mg.band) push(item.thumb_url ?? item.display_url)
    if (urls.length >= 4) break
  }
  return urls
}

function YearMosaic({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return <div className="absolute inset-0 bg-ink/92 backdrop-blur" />
  }
  return (
    <>
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${Math.min(urls.length, 4)}, 1fr)` }}
        aria-hidden="true"
      >
        {urls.slice(0, 4).map((url, index) => (
          <span key={index} className="relative overflow-hidden bg-ink-high">
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </span>
        ))}
      </div>
      {/* Dark wash so the numeral and Play button stay legible over any photo. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink/92 via-ink/78 to-ink/62" />
    </>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{children}</div>
}

/** The default browsing surface for a month's loose photos — a horizontal run
 *  of big cards, scrolled like a Netflix row rather than scanned like a grid. */
function PhotoRail({ items, approximate }: { items: MediaView[]; approximate?: boolean }) {
  return (
    <div className="rail">
      {items.map((item) => (
        <div key={item.id} className="w-[60vw] max-w-[15rem] shrink-0 sm:w-[15rem]">
          <Tile media={item} approximate={approximate} />
        </div>
      ))}
    </div>
  )
}

function Tile({ media, approximate }: { media: MediaView; approximate?: boolean }) {
  const image = media.thumb_url ?? media.display_url
  return (
    <Link
      href={approximate ? `/m/${media.id}?edit=date` : `/m/${media.id}`}
      className="tile group relative block aspect-[4/3] overflow-hidden rounded-xl border border-edge bg-ink-high"
      title={`${media.caption ? `${media.caption} · ` : ''}${formatCapturedAt(media.taken_at, media.taken_precision)}`}
    >
      {image ? (
        <img
          src={image}
          alt={media.caption || ''}
          loading="lazy"
          decoding="async"
          style={{ objectPosition: focalPosition(media) }}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="grid h-full place-items-center text-xs text-paper-faint">{media.type}</span>
      )}
      {media.type === 'video' && (
        <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white/90">
          {duration(media.duration_seconds) || '▶'}
        </span>
      )}
      {approximate && (
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] tracking-wide text-white/85">
          approx.
        </span>
      )}
    </Link>
  )
}

const ARTIFACT_GLYPH: Record<TimelineArtifact['type'], string> = {
  flyer: '🎟️',
  image_doc: '📄',
  pdf: '📄',
  audio: '🎧',
  link: '🔗',
}

/** A small, distinct card for an artifact dated into the timeline — it lives on
 *  its event, so tapping opens that event. */
function ArtifactChip({ artifact }: { artifact: TimelineArtifact }) {
  return (
    <Link
      href={`/community/${artifact.event_id}`}
      className="flex items-center gap-2 rounded-lg border border-edge bg-ink-raised py-1.5 pr-3 pl-1.5 text-sm text-paper-soft transition-colors hover:border-edge-strong hover:text-paper"
    >
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded bg-ink-high text-xs">
        {artifact.thumb ? (
          <img src={artifact.thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{ARTIFACT_GLYPH[artifact.type]}</span>
        )}
      </span>
      <span className="max-w-[12rem] truncate">{artifact.title ?? 'Artifact'}</span>
    </Link>
  )
}

/** A year- or month-precision band: soft dates, one tap from the date editor. */
function ApproximateBand({ label, items }: { label: string; items: MediaView[] }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-edge/80 p-3">
      <p className="mb-2 text-xs tracking-[0.14em] text-paper-faint uppercase">{label}</p>
      <PhotoRail items={items} approximate />
    </div>
  )
}

/**
 * A completed event, sitting at its date. Collapsed by default: one big cover
 * card — a real poster, not a text row — with its title, when, and how many
 * overlaid on the photo. The whole card is the tap target; expanding reveals
 * the full grid *in place* — no navigation, no scroll jump — and the
 * open/closed choice is remembered for the session.
 */
function EventCard({ event }: { event: TimelineEventCard }) {
  const [open, toggle] = useEventOpen(event.id)
  const [items, setItems] = useState<MediaView[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch the full album once, the first time it opens (whether by tap or by a
  // restored session). setState stays inside the async closure, off the effect
  // body, so it's a genuine external-load sync rather than a cascading render.
  useEffect(() => {
    if (!open || items !== null) return
    let active = true
    void (async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/feed?event=${event.id}&limit=60`)
        const payload = (await response.json()) as { media?: MediaView[] }
        if (active) setItems(payload.media ?? [])
      } catch {
        if (active) setItems([])
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [open, items, event.id])

  const emoji = isEmojiOnly(event.name)
  const when = fullDate(showDate(event.date))
  const countLabel =
    event.count > 0 ? `${event.count} ${event.count === 1 ? 'memory' : 'memories'}` : 'No memories yet'
  const cover = event.preview[0] ?? event.cover

  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-ink-raised">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group relative block aspect-[16/10] w-full text-left sm:aspect-[2/1]"
      >
        <EventCover
          src={cover}
          name={event.name.trim() || 'Event'}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <span
          aria-hidden="true"
          className={`absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ⌄
        </span>
        <span className="absolute inset-x-0 bottom-0 p-4">
          <span
            className={`block truncate ${emoji ? 'text-3xl leading-tight' : 'text-xl font-semibold tracking-[-0.02em] text-white'}`}
          >
            {event.name.trim() || 'Untitled event'}
          </span>
          <span className="meta-mono mt-1 block text-white/70">
            {when} · {countLabel}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-edge p-3">
          {loading && <p className="py-3 text-center text-xs text-paper-faint">Loading…</p>}
          {items && items.length > 0 && (
            <Grid>
              {items.map((item) => (
                <Tile key={item.id} media={item} />
              ))}
            </Grid>
          )}
          {items && items.length === 0 && !loading && (
            <p className="py-3 text-center text-xs text-paper-faint">Nothing added to this event yet.</p>
          )}
          <Link
            href={`/collection/event/${event.id}`}
            className="mt-3 block text-center text-xs text-paper-dim transition-colors hover:text-paper"
          >
            Open event →
          </Link>
        </div>
      )}
    </div>
  )
}
