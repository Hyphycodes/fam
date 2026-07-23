'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildReel, kenBurns, type MovieMode as PlayMode, type Segment } from '@/lib/client/reel'
import { MusicBed, MUSIC_LEVEL, MUSIC_LEVEL_QUIET } from '@/lib/client/music'
import { VideoFrame } from '@/components/VideoFrame'
import { Avatar } from '@/components/Avatar'
import { PeopleStack } from '@/components/PeopleStack'
import { formatCapturedAt } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/**
 * Movie Mode.
 *
 * One button, then the archive plays itself: photos drifting, real crossfades,
 * music underneath that gets out of the way when a video has something to say,
 * and the occasional title card to mark where you are.
 *
 * The crossfade works by leaving the outgoing frame in place and fading the
 * incoming one in over the top of it. Because every frame is full-bleed
 * object-cover, that reads as a true dissolve, and it means only one element is
 * ever animating.
 */

const CROSSFADE_MS = 1300

export interface Flavor {
  kind: 'everything' | 'person' | 'event' | 'year' | 'funny'
  id?: string
  year?: number
  label: string
}

export function MovieMode({
  flavors,
  initialMedia,
  autoStart = false,
  initialMode = 'shuffle',
  sourceLabel,
}: {
  flavors: Flavor[]
  initialMedia: MediaView[]
  /** Deep-link entry (playMovie): skip the start screen and play immediately. */
  autoStart?: boolean
  initialMode?: PlayMode
  sourceLabel?: string
}) {
  const router = useRouter()
  const [flavor, setFlavor] = useState<Flavor>(
    sourceLabel ? { kind: 'everything', label: sourceLabel } : { kind: 'everything', label: 'Everything' },
  )
  const [media, setMedia] = useState<MediaView[]>(initialMedia)
  const [mode, setMode] = useState<PlayMode>(initialMode)
  const [quiet, setQuiet] = useState(false)
  const [started, setStarted] = useState(autoStart)
  const [playing, setPlaying] = useState(true)
  const [index, setIndex] = useState(0)
  const [previous, setPrevious] = useState<Segment | null>(null)
  const [showControls, setShowControls] = useState(true)
  const [tracks, setTracks] = useState<{ id: string; url: string }[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  // Lazy initialiser, not a ref: the bed is created once and is never read
  // during render.
  const [music] = useState(() => new MusicBed())
  // The shuffle seed persists for the session, so a refresh resumes the same
  // sequence instead of reshuffling. Recency is a cross-session signal.
  const [seed] = useState(sessionSeed)
  const [recentlyShown] = useState(readRecentlyShown)

  const reel = useMemo(
    () => buildReel(media, { quiet, mode, seed, recentlyShown }),
    [media, quiet, mode, seed, recentlyShown],
  )
  const segment = reel[index] ?? null

  // ---------------------------------------------------------------------
  // Music
  // ---------------------------------------------------------------------
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/music')
        if (!response.ok) return
        const data = (await response.json()) as { tracks: { id: string; url: string }[] }
        setTracks(data.tracks)
      } catch {
        // No music is a perfectly fine way to watch this.
      }
    })()
  }, [])

  useEffect(() => {
    music.attach(audioRef.current)
    return () => music.dispose()
  }, [music])

  useEffect(() => {
    music.setBaseLevel(quiet ? MUSIC_LEVEL_QUIET : MUSIC_LEVEL)
  }, [music, quiet])

  // The whole point of the duck: music gets out of a video's way.
  useEffect(() => {
    if (!started || !playing) return
    if (segment?.kind === 'media' && segment.media.type === 'video') music.duck()
    else music.swell()
  }, [segment, started, playing, music])

  useEffect(() => {
    if (!started) return
    const audio = audioRef.current
    if (!audio) return
    if (playing) void audio.play().catch(() => {})
    else audio.pause()
  }, [playing, started])

  // ---------------------------------------------------------------------
  // Advancing
  // ---------------------------------------------------------------------
  const advance = useCallback(
    (delta = 1) => {
      setPrevious(reel[index] ?? null)
      setIndex((current) => {
        const next = current + delta
        if (next < 0) return 0
        // Loop forever — this runs unattended at a cookout.
        return next >= reel.length ? 0 : next
      })
    },
    [index, reel],
  )

  useEffect(() => {
    if (!started || !playing || !segment) return
    const timer = window.setTimeout(() => advance(1), segment.ms)
    return () => window.clearTimeout(timer)
  }, [started, playing, segment, advance])

  // Drop the outgoing frame once the dissolve has finished.
  useEffect(() => {
    if (!previous) return
    const timer = window.setTimeout(() => setPrevious(null), CROSSFADE_MS)
    return () => window.clearTimeout(timer)
  }, [previous])

  // Warm the next few images so a dissolve never lands on a blank frame.
  useEffect(() => {
    for (let offset = 1; offset <= 3; offset += 1) {
      const upcoming = reel[index + offset]
      if (upcoming?.kind === 'media' && upcoming.media.display_url) {
        const image = new Image()
        image.src = upcoming.media.display_url
      }
    }
  }, [index, reel])

  // Remember what's been shown so shuffle can float fresher memories forward
  // next time. Cross-session, capped.
  useEffect(() => {
    if (segment?.kind === 'media') recordShown(segment.media.id)
  }, [segment])

  // Keep the screen awake — this runs plugged into a TV for hours.
  useEffect(() => {
    if (!started) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null
      } catch {
        // Denied or unsupported — nothing to do; the run just relies on the OS.
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [started])

  // ---------------------------------------------------------------------
  // Chrome that gets out of the way
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!started) return
    let timer: number
    const wake = () => {
      setShowControls(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setShowControls(false), 3200)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('touchstart', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [started])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault()
        setPlaying((p) => !p)
      }
      if (event.key === 'ArrowRight') advance(1)
      if (event.key === 'ArrowLeft') advance(-1)
      if (event.key === 'Escape' && !document.fullscreenElement) router.push('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, router])

  // ---------------------------------------------------------------------
  // Flavours
  // ---------------------------------------------------------------------
  const choose = useCallback(async (next: Flavor) => {
    setFlavor(next)
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (next.kind === 'person' && next.id) params.set('person', next.id)
      if (next.kind === 'event' && next.id) params.set('event', next.id)
      if (next.kind === 'year' && next.year) params.set('year', String(next.year))
      if (next.kind === 'funny') params.set('flavor', 'funny')

      const response = await fetch(`/api/movie?${params}`)
      if (response.ok) {
        const data = (await response.json()) as { media: MediaView[] }
        setMedia(data.media)
        setIndex(0)
        setPrevious(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const start = useCallback(() => {
    setStarted(true)
    setPlaying(true)
    // Ask for fullscreen inside the click, while we still have the gesture.
    void document.documentElement.requestFullscreen?.().catch(() => {})
    const audio = audioRef.current
    if (audio) void audio.play().catch(() => {})
  }, [])

  if (!started) {
    return (
      <StartScreen
        count={media.length}
        thumbs={media
          .map((m) => m.thumb_url)
          .filter((url): url is string => Boolean(url))
          .slice(0, 12)}
        flavors={flavors}
        flavor={flavor}
        quiet={quiet}
        mode={mode}
        onMode={setMode}
        onQuiet={setQuiet}
        onFlavor={choose}
        onStart={start}
        loading={loading}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden bg-black">
      {tracks.length > 0 && (
        <audio
          ref={audioRef}
          src={tracks[trackIndex]?.url}
          autoPlay
          onEnded={() => setTrackIndex((current) => (current + 1) % tracks.length)}
        />
      )}

      {previous && <Frame segment={previous} index={index - 1} kind="outgoing" />}
      {segment && (
        <Frame segment={segment} index={index} kind="incoming" onFail={() => advance(1)} />
      )}

      <Controls
        visible={showControls}
        playing={playing}
        flavor={flavor}
        flavors={flavors}
        quiet={quiet}
        mode={mode}
        loading={loading}
        onPlayPause={() => setPlaying((p) => !p)}
        onSkip={() => advance(1)}
        onBack={() => advance(-1)}
        onFlavor={choose}
        onMode={setMode}
        onQuiet={setQuiet}
        onExit={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
          router.push('/')
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function Frame({
  segment,
  index,
  kind,
  onFail,
}: {
  segment: Segment
  index: number
  kind: 'incoming' | 'outgoing'
  onFail?: () => void
}) {
  // The outgoing frame just sits there; the incoming one dissolves over it.
  const style =
    kind === 'incoming'
      ? { animation: `fade ${CROSSFADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both` }
      : undefined

  if (segment.kind === 'title') {
    return (
      <div
        className={`absolute inset-0 grid place-items-center bg-black px-10 ${
          kind === 'incoming' ? 'z-20' : 'z-10'
        }`}
        style={style}
      >
        <div className="text-center">
          <h2 className="font-display text-[clamp(2.5rem,9vw,7rem)] leading-none text-paper text-balance">
            {segment.title}
          </h2>
          {segment.sub && (
            <p className="mt-6 text-[clamp(0.8rem,1.6vw,1.1rem)] tracking-[0.35em] text-paper-dim uppercase">
              {segment.sub}
            </p>
          )}
        </div>
      </div>
    )
  }

  const { media } = segment

  return (
    <div
      className={`absolute inset-0 ${kind === 'incoming' ? 'z-20' : 'z-10'}`}
      style={style}
    >
      {media.type === 'video' && media.iframe_url ? (
        <VideoFrame
          src={media.iframe_url}
          poster={media.display_url}
          autoplay
          controls={false}
          className="h-full w-full object-cover"
          title={media.caption ?? 'Video'}
        />
      ) : media.display_url ? (
        <img
          src={media.display_url}
          alt=""
          className={`h-full w-full object-cover ${kenBurns(index)}`}
          onError={kind === 'incoming' ? onFail : undefined}
        />
      ) : (
        <div className="h-full w-full bg-black" />
      )}

      {/* A whisper of context, bottom-left, easy to ignore. */}
      {(media.caption || media.event_name) && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 to-transparent px-[6vw] pt-32 pb-[8vh]">
          {media.caption && (
            <p className="font-display text-[clamp(1.4rem,3.4vw,3rem)] leading-tight text-paper text-balance">
              {media.caption}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="flex items-center gap-1.5 text-[clamp(0.7rem,1.2vw,0.95rem)] tracking-[0.2em] text-paper-dim uppercase">
              <Avatar name={media.uploader_name} src={media.uploader_avatar_url} size={20} />
              {formatCapturedAt(media.taken_at, media.taken_precision)}
            </span>
            {media.people.length > 0 && <PeopleStack people={media.people} size={20} max={4} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function StartScreen({
  count,
  thumbs,
  flavors,
  flavor,
  quiet,
  mode,
  loading,
  onMode,
  onQuiet,
  onFlavor,
  onStart,
}: {
  count: number
  thumbs: string[]
  flavors: Flavor[]
  flavor: Flavor
  quiet: boolean
  mode: PlayMode
  loading: boolean
  onMode: (mode: PlayMode) => void
  onQuiet: (value: boolean) => void
  onFlavor: (flavor: Flavor) => void
  onStart: () => void
}) {
  return (
    <div className="lamplight relative flex min-h-dvh flex-col justify-center overflow-hidden px-6 py-20 sm:px-12">
      {/* The family's own memories, dimmed to a murmur behind the marquee —
          like standing in the projection booth before the show. */}
      {thumbs.length >= 4 && (
        <div className="absolute inset-0" aria-hidden>
          <div className="grid h-full w-full grid-cols-3 gap-2 opacity-[0.13] blur-[2px] saturate-[0.7] sm:grid-cols-4">
            {thumbs.map((url, index) => (
              <img
                key={`${url.slice(0, 80)}-${index}`}
                src={url}
                alt=""
                className="h-full w-full object-cover"
                style={{ transform: index % 2 ? 'scale(1.06)' : undefined }}
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/80" />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-3xl">
        <p className="mb-4 text-xs tracking-[0.35em] text-paper-faint uppercase">Movie mode</p>
        <h1 className="text-[clamp(3rem,11vw,7rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-balance">
          Movie Mode
        </h1>

        <p className="mt-8 max-w-lg text-lg text-paper-soft text-balance">
          {count > 0
            ? `${count} ${count === 1 ? 'item' : 'items'} available for continuous playback.`
            : 'Add photos or videos to use Movie Mode.'}
        </p>

        <div className="mt-12">
          <p className="mb-4 text-xs tracking-[0.25em] text-paper-faint uppercase">
            What are we watching
          </p>
          <div className="flex flex-wrap gap-2">
            {flavors.map((option) => {
              const active =
                option.kind === flavor.kind &&
                option.id === flavor.id &&
                option.year === flavor.year
              return (
                <button
                  key={`${option.kind}-${option.id ?? option.year ?? 'all'}`}
                  onClick={() => onFlavor(option)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    active
                      ? 'border-white bg-white text-ink'
                      : 'border-edge-strong text-paper-soft hover:bg-ink-hover hover:text-paper'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-8">
          <p className="mb-3 text-xs tracking-[0.25em] text-paper-faint uppercase">How it plays</p>
          <ModeToggle mode={mode} onMode={onMode} />
          <p className="mt-2 text-sm text-paper-faint">
            {mode === 'full' ? 'In order, oldest to newest — the story.' : 'Shuffled, resuming where you left off.'}
          </p>
        </div>

        <label className="mt-8 flex w-fit cursor-pointer items-center gap-3 text-sm text-paper-soft">
          <input
            type="checkbox"
            checked={quiet}
            onChange={(event) => onQuiet(event.target.checked)}
            className="h-4 w-4 accent-white"
          />
          Quiet background mode — longer holds, softer music, no title cards
        </label>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <button
            onClick={onStart}
            disabled={count === 0 || loading}
            className="btn btn-primary px-10 py-4 text-base"
          >
            {loading ? 'Loading…' : 'Start'}
          </button>
          <Link href="/" className="btn btn-ghost">
            Back
          </Link>
        </div>
      </div>
    </div>
  )
}

function Controls({
  visible,
  playing,
  flavor,
  flavors,
  quiet,
  mode,
  loading,
  onPlayPause,
  onSkip,
  onBack,
  onFlavor,
  onMode,
  onQuiet,
  onExit,
}: {
  visible: boolean
  playing: boolean
  flavor: Flavor
  flavors: Flavor[]
  quiet: boolean
  mode: PlayMode
  loading: boolean
  onPlayPause: () => void
  onSkip: () => void
  onBack: () => void
  onFlavor: (flavor: Flavor) => void
  onMode: (mode: PlayMode) => void
  onQuiet: (value: boolean) => void
  onExit: () => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <div
      className={`absolute inset-0 z-40 transition-opacity duration-700 ${
        visible || picking ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        onClick={onExit}
        className="absolute top-6 right-6 rounded-full border border-white/15 bg-black/40 px-5 py-2.5 text-sm text-white/70 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
      >
        Exit
      </button>

      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/50 p-2 backdrop-blur-xl">
        <ControlButton label="Back" onClick={onBack}>
          ‹
        </ControlButton>
        <ControlButton label={playing ? 'Pause' : 'Play'} onClick={onPlayPause}>
          {playing ? '❙❙' : '▶'}
        </ControlButton>
        <ControlButton label="Skip" onClick={onSkip}>
          ›
        </ControlButton>

        <div className="mx-1 h-6 w-px bg-white/15" />

        <button
          onClick={() => setPicking((p) => !p)}
          className="rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {loading ? 'Loading…' : flavor.label}
        </button>
      </div>

      {picking && (
        <div className="absolute bottom-28 left-1/2 w-[min(90vw,26rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/85 p-3 backdrop-blur-xl animate-rise">
          <div className="flex flex-wrap gap-2">
            {flavors.map((option) => (
              <button
                key={`${option.kind}-${option.id ?? option.year ?? 'all'}`}
                onClick={() => {
                  onFlavor(option)
                  setPicking(false)
                }}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 px-1">
            <ModeToggle mode={mode} onMode={onMode} tone="dark" />
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 px-1 text-sm text-white/60">
            <input
              type="checkbox"
              checked={quiet}
              onChange={(event) => onQuiet(event.target.checked)}
              className="h-3.5 w-3.5 accent-white"
            />
            Quiet background mode
          </label>
        </div>
      )}
    </div>
  )
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}

/** Full / Shuffle — the two shipped modes. */
function ModeToggle({
  mode,
  onMode,
  tone = 'light',
}: {
  mode: PlayMode
  onMode: (mode: PlayMode) => void
  tone?: 'light' | 'dark'
}) {
  return (
    <div className="inline-flex gap-1" role="group" aria-label="Playback mode">
      {(['full', 'shuffle'] as const).map((value) => {
        const active = mode === value
        const base = 'rounded-full px-3.5 py-1.5 text-sm capitalize transition-colors'
        const cls =
          tone === 'dark'
            ? active
              ? 'bg-white/15 text-white'
              : 'text-white/60 hover:text-white'
            : active
              ? 'border border-white bg-white text-ink'
              : 'border border-edge-strong text-paper-soft hover:bg-ink-hover hover:text-paper'
        return (
          <button key={value} type="button" aria-pressed={active} onClick={() => onMode(value)} className={`${base} ${cls}`}>
            {value}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session persistence for shuffle
// ---------------------------------------------------------------------------

function sessionSeed(): number {
  if (typeof window === 'undefined') return 1
  try {
    const stored = window.sessionStorage.getItem('reel:seed')
    if (stored) return Number(stored)
    const seed = Math.floor(Math.random() * 2 ** 31)
    window.sessionStorage.setItem('reel:seed', String(seed))
    return seed
  } catch {
    return 1
  }
}

function readRecentlyShown(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = window.localStorage.getItem('reel:recent')
    return new Set(stored ? (JSON.parse(stored) as string[]) : [])
  } catch {
    return new Set()
  }
}

function recordShown(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const list = JSON.parse(window.localStorage.getItem('reel:recent') ?? '[]') as string[]
    const next = [id, ...list.filter((entry) => entry !== id)].slice(0, 300)
    window.localStorage.setItem('reel:recent', JSON.stringify(next))
  } catch {
    // Recency is a nicety, not a requirement.
  }
}
