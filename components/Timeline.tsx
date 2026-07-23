'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { duration, formatCapturedAt } from '@/lib/format'
import type { MediaView } from '@/lib/types'
import type { MonthCount, TimelineCursor } from '@/lib/timeline'

/**
 * The Timeline — one continuous scroll through the whole archive, ordered by
 * capture date. Three densities in one route: a persistent decades/years rail to
 * jump, pinned year headers as you pass them, and month grids of everything.
 *
 * Performance is built for tens of thousands of items: keyset pagination on
 * (taken_at, id), month sections use CSS `content-visibility` so off-screen
 * months aren't laid out or painted, images lazy-load into fixed-aspect boxes
 * (no layout shift), and the rail's volumes come from a grouped count, never
 * from the rows themselves.
 */

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MAX_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PAGE = 48

interface MonthGroup {
  year: number
  month: number
  band: MediaView[] // month-precision items — surfaced at the top of the month
  grid: MediaView[]
  events: { id: string; name: string; cover: string | null; count: number }[]
}
interface YearGroup {
  year: number
  band: MediaView[] // year-precision items — surfaced at the top of the year
  months: MonthGroup[]
}

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
      mg = { year: item.taken_year, month: item.taken_month, band: [], grid: [], events: [] }
      yg.months.push(mg)
    }
    if (item.taken_precision === 'month') mg.band.push(item)
    else mg.grid.push(item)
  }
  for (const yg of years.values()) {
    yg.months.sort((a, b) => b.month - a.month)
    for (const mg of yg.months) {
      const seen = new Map<string, MonthGroup['events'][number]>()
      for (const item of [...mg.band, ...mg.grid]) {
        if (!item.event_id || !item.event_name) continue
        const existing = seen.get(item.event_id)
        if (existing) existing.count += 1
        else
          seen.set(item.event_id, {
            id: item.event_id,
            name: item.event_name,
            cover: item.thumb_url ?? item.display_url,
            count: 1,
          })
      }
      mg.events = [...seen.values()]
    }
  }
  return [...years.values()].sort((a, b) => b.year - a.year)
}

export function Timeline({
  initialMedia,
  initialCursor,
  monthCounts,
  people,
}: {
  initialMedia: MediaView[]
  initialCursor: TimelineCursor | null
  monthCounts: MonthCount[]
  people: { id: string; name: string }[]
}) {
  const [media, setMedia] = useState(initialMedia)
  const [cursor, setCursor] = useState<TimelineCursor | null>(initialCursor)
  const [done, setDone] = useState(initialCursor === null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'photo' | 'video' | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)

  const filtered = type !== null || personId !== null
  const groups = useMemo(() => group(media), [media])

  // Years that have content, grouped by decade — the rail. Volumes come from the
  // grouped count so this is right even before the matching rows have loaded.
  const rail = useMemo(() => {
    const byYear = new Map<number, number>()
    for (const bucket of monthCounts) {
      byYear.set(bucket.year, (byYear.get(bucket.year) ?? 0) + bucket.count)
    }
    const years = [...byYear.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year)
    const max = years.reduce((m, y) => Math.max(m, y.count), 1)
    const decades = new Map<number, { year: number; count: number; weight: number }[]>()
    for (const y of years) {
      const decade = Math.floor(y.year / 10) * 10
      const list = decades.get(decade) ?? []
      list.push({ ...y, weight: Math.max(0.15, y.count / max) })
      decades.set(decade, list)
    }
    return [...decades.entries()].map(([decade, entries]) => ({ decade, entries })).sort(
      (a, b) => b.decade - a.decade,
    )
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
  function jumpToYear(year: number) {
    void fetchPage({
      cursor: { takenAt: new Date(Date.UTC(year + 1, 0, 1)).toISOString(), id: MAX_ID },
      replace: true,
    })
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

        {rail.length > 0 && (
          <div className="mt-2 flex gap-3 overflow-x-auto pb-0.5">
            {rail.map(({ decade, entries }) => (
              <div key={decade} className="flex shrink-0 items-end gap-1.5">
                <span className="meta-mono self-center pr-0.5 text-paper-faint">{decade}s</span>
                {entries.map((entry) => (
                  <button
                    key={entry.year}
                    type="button"
                    onClick={() => jumpToYear(entry.year)}
                    title={`${entry.year} · ${entry.count} ${entry.count === 1 ? 'item' : 'items'}`}
                    className="group flex flex-col items-center gap-1"
                  >
                    <span
                      aria-hidden="true"
                      className="w-3 rounded-full bg-paper-faint/50 transition-colors group-hover:bg-paper"
                      style={{ height: `${Math.round(6 + entry.weight * 18)}px` }}
                    />
                    <span className="text-[10px] text-paper-dim transition-colors group-hover:text-paper">
                      {String(entry.year).slice(2)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

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
            <section key={yg.year} aria-label={String(yg.year)}>
              <h2 className="sticky top-[84px] z-20 -mx-5 bg-ink/92 px-5 py-2 font-display text-3xl tracking-[-0.02em] text-paper backdrop-blur sm:-mx-6 sm:px-6">
                {yg.year}
              </h2>

              {yg.band.length > 0 && (
                <ApproximateBand
                  label={`${yg.year} · dates approximate`}
                  items={yg.band}
                />
              )}

              {yg.months.map((mg) => (
                <section
                  key={`${mg.year}-${mg.month}`}
                  aria-label={`${MONTHS[mg.month]} ${mg.year}`}
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: `0 ${estimateHeight(mg)}px`,
                  }}
                >
                  <h3 className="mt-5 mb-3 text-sm font-medium tracking-[0.14em] text-paper-dim uppercase">
                    {MONTHS[mg.month]}
                  </h3>

                  {mg.events.map((event) => (
                    <AlbumCard key={event.id} event={event} />
                  ))}

                  {mg.band.length > 0 && (
                    <ApproximateBand label={`${MONTHS[mg.month]} ${mg.year} · approximate`} items={mg.band} />
                  )}

                  <Grid>
                    {mg.grid.map((item) => (
                      <Tile key={item.id} media={item} />
                    ))}
                  </Grid>
                </section>
              ))}
            </section>
          ))}
        </div>
      )}

      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {loading && (
        <p className="py-8 text-center text-sm text-paper-faint">Loading…</p>
      )}
      {done && groups.length > 0 && (
        <p className="py-8 text-center text-xs text-paper-faint">The beginning.</p>
      )}
    </div>
  )
}

function estimateHeight(mg: MonthGroup): number {
  const tiles = mg.grid.length + mg.band.length
  const rows = Math.ceil(tiles / 3)
  return 60 + mg.events.length * 64 + rows * 128
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{children}</div>
}

function Tile({ media, approximate }: { media: MediaView; approximate?: boolean }) {
  const image = media.thumb_url ?? media.display_url
  return (
    <Link
      href={approximate ? `/m/${media.id}?edit=date` : `/m/${media.id}`}
      className="tile group relative block aspect-square overflow-hidden rounded-lg border border-edge bg-ink-high"
      title={`${media.caption ? `${media.caption} · ` : ''}${formatCapturedAt(media.taken_at, media.taken_precision)}`}
    >
      {image ? (
        <img
          src={image}
          alt={media.caption || ''}
          loading="lazy"
          decoding="async"
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

/** A year- or month-precision band: soft dates, one tap from the date editor. */
function ApproximateBand({ label, items }: { label: string; items: MediaView[] }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-edge/80 p-3">
      <p className="mb-2 text-xs tracking-[0.14em] text-paper-faint uppercase">{label}</p>
      <Grid>
        {items.map((item) => (
          <Tile key={item.id} media={item} approximate />
        ))}
      </Grid>
    </div>
  )
}

/**
 * An album/event as a grouped card at its place in the month — a lens over the
 * timeline, never a container: its photos also appear individually in the grid.
 * Expands in place (no navigation) to show the whole album.
 */
function AlbumCard({ event }: { event: { id: string; name: string; cover: string | null; count: number } }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<MediaView[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !items && !loading) {
      setLoading(true)
      try {
        const response = await fetch(`/api/feed?event=${event.id}&limit=60`)
        const payload = (await response.json()) as { media?: MediaView[] }
        setItems(payload.media ?? [])
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-edge bg-ink-raised">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-ink-hover"
      >
        <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-high">
          {event.cover && (
            <img src={event.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-paper">{event.name}</span>
          <span className="meta-mono text-paper-faint">
            {event.count} {event.count === 1 ? 'item' : 'items'} this month
          </span>
        </span>
        <span aria-hidden="true" className={`text-paper-faint transition-transform ${open ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>
      {open && (
        <div className="border-t border-edge p-2.5">
          {loading && <p className="py-3 text-center text-xs text-paper-faint">Loading album…</p>}
          {items && items.length > 0 && (
            <Grid>
              {items.map((item) => (
                <Tile key={item.id} media={item} />
              ))}
            </Grid>
          )}
          {items && items.length === 0 && !loading && (
            <p className="py-3 text-center text-xs text-paper-faint">This album is empty.</p>
          )}
          <Link
            href={`/collection/event/${event.id}`}
            className="mt-2 block text-center text-xs text-paper-dim transition-colors hover:text-paper"
          >
            Open album →
          </Link>
        </div>
      )}
    </div>
  )
}
