'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCapturedAt, season } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/**
 * The Featured Memory — the cheapest "alive" in the app.
 *
 * A weighted candidate pool comes from the server; the client picks a fresh one
 * on every load (never the previous load's pick), cross-dissolves it in, and —
 * if you sit on Home — keeps dissolving to the next every few seconds. It pauses
 * when you're interacting or the tab is hidden, respects `prefers-reduced-motion`
 * (which becomes a still frame, no cycling), preloads the next candidate so a
 * dissolve never reveals a blank, and Shuffle forces the next pick at once.
 *
 * The base layer always shows a fully-loaded frame; the incoming one fades in on
 * top of it, so even a slow image never flashes empty.
 */

const IDLE_MS = 8000
const DISSOLVE_MS = 620
const RECENT_KEY = 'featured:recent'
const LAST_KEY = 'featured:last'
const RECENT_MAX = 5

function heroImage(media: MediaView): string | null {
  return media.display_url ?? media.thumb_url
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function readList(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
  } catch {
    return []
  }
}
function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private-mode storage can throw; rotation just loses its cross-session memory.
  }
}

/** A weighted pick from the pool: earlier entries (on-this-day, favourites,
 *  high-precision) weigh more. Excludes the given ids where it can, and prefers
 *  candidates not shown recently — but never returns nothing when the pool has
 *  options. */
function weightedPick(pool: MediaView[], exclude: Set<string>, recent: string[]): MediaView {
  const fresh = pool.filter((m) => !exclude.has(m.id) && !recent.includes(m.id))
  const eligible = fresh.length ? fresh : pool.filter((m) => !exclude.has(m.id))
  const from = eligible.length ? eligible : pool
  // Triangular weighting toward the front, without reading the clock.
  const weights = from.map((_, index) => from.length - index)
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (let index = 0; index < from.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return from[index]
  }
  return from[from.length - 1]
}

export function FeaturedMemory({ pool, initial }: { pool: MediaView[]; initial: MediaView }) {
  const [shown, setShown] = useState<MediaView>(initial)
  const [incoming, setIncoming] = useState<MediaView | null>(null)

  const shownRef = useRef<MediaView>(initial)
  const busyRef = useRef(false)
  const pausedRef = useRef(false)
  const recentRef = useRef<string[]>([])
  const nextRef = useRef<MediaView | null>(null)

  const remember = useCallback((id: string) => {
    const recent = [id, ...recentRef.current.filter((entry) => entry !== id)].slice(0, RECENT_MAX)
    recentRef.current = recent
    writeList(RECENT_KEY, recent)
    writeList(LAST_KEY, [id])
  }, [])

  const advanceTo = useCallback((next: MediaView | null) => {
    if (!next || busyRef.current || next.id === shownRef.current.id) return
    busyRef.current = true
    setIncoming(next)
  }, [])

  const shuffle = useCallback(() => {
    const exclude = new Set([shownRef.current.id])
    advanceTo(nextRef.current ?? weightedPick(pool, exclude, recentRef.current))
  }, [advanceTo, pool])

  // Promote the incoming frame once it has dissolved in (setState stays in the
  // timeout callback, off the effect body — a real transition, not a cascade).
  useEffect(() => {
    if (!incoming) return
    const hold = prefersReducedMotion() ? 0 : DISSOLVE_MS
    const timer = window.setTimeout(() => {
      shownRef.current = incoming
      remember(incoming.id)
      setShown(incoming)
      setIncoming(null)
      busyRef.current = false
    }, hold)
    return () => window.clearTimeout(timer)
  }, [incoming, remember])

  // First pick on load + idle cycling. Reduced motion gets a single still frame.
  useEffect(() => {
    if (pool.length < 2) return
    recentRef.current = readList(RECENT_KEY)
    const last = readList(LAST_KEY)
    const first = weightedPick(pool, new Set([initial.id, ...last]), recentRef.current)
    const kickoff = window.setTimeout(() => advanceTo(first), 90)

    if (prefersReducedMotion()) return () => window.clearTimeout(kickoff)

    const interval = window.setInterval(() => {
      if (pausedRef.current || busyRef.current || document.hidden) return
      advanceTo(nextRef.current ?? weightedPick(pool, new Set([shownRef.current.id]), recentRef.current))
    }, IDLE_MS)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(interval)
    }
  }, [pool, initial, advanceTo])

  // Preload the frame we'll most likely show next.
  useEffect(() => {
    if (pool.length < 2) return
    const next = weightedPick(pool, new Set([shown.id]), recentRef.current)
    nextRef.current = next
    const url = heroImage(next)
    if (url) {
      const image = new Image()
      image.src = url
    }
  }, [shown, pool])

  const active = incoming ?? shown
  const base = heroImage(shown)
  const top = incoming ? heroImage(incoming) : null
  const title = active.caption || active.event_name || season(active.taken_at)

  return (
    <section
      className="full-bleed relative overflow-hidden bg-ink-raised"
      onPointerEnter={() => {
        pausedRef.current = true
      }}
      onPointerLeave={() => {
        pausedRef.current = false
      }}
    >
      <div className="relative h-[68svh] max-h-[42rem] min-h-[26rem]">
        {base && (
          <img src={base} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {top && (
          <img
            key={active.id}
            src={top}
            alt=""
            className="animate-fade absolute inset-0 h-full w-full object-cover"
          />
        )}

        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/45 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl px-5 pb-8 sm:px-6 sm:pb-12">
          <div key={active.id} className="animate-fade">
            <p className="eyebrow text-white/60">Featured memory</p>
            <h1 className="mt-2 max-w-2xl text-[clamp(1.85rem,5.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-white text-balance">
              {title}
            </h1>
            <p className="meta-mono mt-2.5 flex flex-wrap items-center gap-x-2 text-white/60">
              {formatCapturedAt(active.taken_at, active.taken_precision)}
              {active.event_name && active.event_name !== title && (
                <>
                  <span className="text-white/30">·</span>
                  {active.event_name}
                </>
              )}
            </p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Link href={`/m/${active.id}`} className="btn btn-primary">
              <PlayGlyph /> Open
            </Link>
            <button type="button" onClick={shuffle} className="btn btn-ghost backdrop-blur-sm">
              <ShuffleGlyph /> Shuffle
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function ShuffleGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  )
}
