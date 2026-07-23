'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FeaturedItem } from '@/lib/home'

/**
 * The Featured Memory — the cheapest "alive" in the app.
 *
 * The server hands a weighted candidate pool where each item models its
 * *subject* (what the label says and the button opens) apart from its *cover*
 * (the image). So a hero titled "Father's Day 2023" opens the event, and a lone
 * photo opens the photo — the label and the click always agree.
 *
 * The client picks a fresh one on every load (never the previous pick),
 * cross-dissolves it in, and — if you sit on Home — dissolves to the next every
 * few seconds. It pauses on interaction or a hidden tab, preloads the next so a
 * dissolve never flashes empty, goes still under `prefers-reduced-motion`, and
 * Shuffle forces the next pick.
 *
 * Framing is fixed inside a constant 16:9-ish box: landscape covers crop to
 * their focal point; a portrait source (9:16 phone video, a tall still) is shown
 * whole, letterboxed against a blurred, darkened copy of itself — nothing
 * cropped, the same at 390px and 1440px.
 */

const IDLE_MS = 8000
const DISSOLVE_MS = 620
const RECENT_KEY = 'featured:recent'
const LAST_KEY = 'featured:last'
const RECENT_MAX = 5
/** Below this width/height ratio a source is "meaningfully taller" than the box. */
const PORTRAIT_MAX = 1.2

const keyOf = (item: FeaturedItem) => `${item.subjectType}:${item.subjectId}`

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

/** A weighted pick: earlier entries (on-this-day, favourites, high-precision,
 *  landscape) weigh more. Excludes the given keys where it can, prefers ones not
 *  shown recently, and never returns nothing when the pool has options. */
function weightedPick(pool: FeaturedItem[], exclude: Set<string>, recent: string[]): FeaturedItem {
  const fresh = pool.filter((item) => !exclude.has(keyOf(item)) && !recent.includes(keyOf(item)))
  const eligible = fresh.length ? fresh : pool.filter((item) => !exclude.has(keyOf(item)))
  const from = eligible.length ? eligible : pool
  const weights = from.map((_, index) => from.length - index)
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (let index = 0; index < from.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return from[index]
  }
  return from[from.length - 1]
}

export function FeaturedMemory({ pool, initial }: { pool: FeaturedItem[]; initial: FeaturedItem }) {
  const [shown, setShown] = useState<FeaturedItem>(initial)
  const [incoming, setIncoming] = useState<FeaturedItem | null>(null)

  const shownRef = useRef<FeaturedItem>(initial)
  const busyRef = useRef(false)
  const pausedRef = useRef(false)
  const recentRef = useRef<string[]>([])
  const nextRef = useRef<FeaturedItem | null>(null)

  const remember = useCallback((key: string) => {
    const recent = [key, ...recentRef.current.filter((entry) => entry !== key)].slice(0, RECENT_MAX)
    recentRef.current = recent
    writeList(RECENT_KEY, recent)
    writeList(LAST_KEY, [key])
  }, [])

  const advanceTo = useCallback((next: FeaturedItem | null) => {
    if (!next || busyRef.current || keyOf(next) === keyOf(shownRef.current)) return
    busyRef.current = true
    setIncoming(next)
  }, [])

  const shuffle = useCallback(() => {
    const exclude = new Set([keyOf(shownRef.current)])
    advanceTo(nextRef.current ?? weightedPick(pool, exclude, recentRef.current))
  }, [advanceTo, pool])

  // Promote the incoming frame once it has dissolved in (setState stays in the
  // timeout callback, off the effect body — a real transition, not a cascade).
  useEffect(() => {
    if (!incoming) return
    const hold = prefersReducedMotion() ? 0 : DISSOLVE_MS
    const timer = window.setTimeout(() => {
      shownRef.current = incoming
      remember(keyOf(incoming))
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
    const first = weightedPick(pool, new Set([keyOf(initial), ...last]), recentRef.current)
    const kickoff = window.setTimeout(() => advanceTo(first), 90)

    if (prefersReducedMotion()) return () => window.clearTimeout(kickoff)

    const interval = window.setInterval(() => {
      if (pausedRef.current || busyRef.current || document.hidden) return
      advanceTo(nextRef.current ?? weightedPick(pool, new Set([keyOf(shownRef.current)]), recentRef.current))
    }, IDLE_MS)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(interval)
    }
  }, [pool, initial, advanceTo])

  // Preload the frame we'll most likely show next.
  useEffect(() => {
    if (pool.length < 2) return
    const next = weightedPick(pool, new Set([keyOf(shown)]), recentRef.current)
    nextRef.current = next
    if (next.image) {
      const image = new Image()
      image.src = next.image
    }
  }, [shown, pool])

  const active = incoming ?? shown

  return (
    <section
      className="full-bleed relative overflow-hidden bg-ink"
      onPointerEnter={() => {
        pausedRef.current = true
      }}
      onPointerLeave={() => {
        pausedRef.current = false
      }}
    >
      <div className="relative h-[68svh] max-h-[42rem] min-h-[26rem]">
        <Frame item={shown} priority />
        {incoming && (
          <div key={keyOf(incoming)} className="animate-fade absolute inset-0">
            <Frame item={incoming} />
          </div>
        )}

        {/* Scrims tuned to hold white text over a bright daylight shot and a dark
            night one alike: a heavy bottom rise plus a light top wash. */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/55 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl px-5 pb-8 sm:px-6 sm:pb-12">
          <div key={keyOf(active)} className="animate-fade">
            <p className="eyebrow text-white/70">Featured memory</p>
            <h1 className="mt-2 max-w-2xl text-[clamp(1.85rem,5.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-white text-balance [text-shadow:0_2px_18px_rgba(0,0,0,0.5)]">
              {active.title}
            </h1>
            <p className="meta-mono mt-2.5 text-white/70">{active.dateLabel}</p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Link href={active.href} className="btn btn-primary">
              <PlayGlyph /> Open
            </Link>
            <button type="button" onClick={shuffle} className="btn btn-ghost text-white backdrop-blur-sm">
              <ShuffleGlyph /> Shuffle
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/** One hero frame. Landscape crops to its focal point; a portrait source shows
 *  whole against a blurred copy of itself, so nothing is ever cut off. */
function Frame({ item, priority = false }: { item: FeaturedItem; priority?: boolean }) {
  if (!item.image) return <span className="absolute inset-0 bg-ink-raised" />

  const portrait =
    item.width && item.height ? item.width / item.height < PORTRAIT_MAX : false

  if (portrait) {
    return (
      <>
        <img
          src={item.image}
          alt=""
          aria-hidden="true"
          fetchPriority={priority ? 'high' : undefined}
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50"
        />
        <img
          src={item.image}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />
      </>
    )
  }

  return (
    <img
      src={item.image}
      alt=""
      fetchPriority={priority ? 'high' : undefined}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: `${item.focalX * 100}% ${item.focalY * 100}%` }}
    />
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
