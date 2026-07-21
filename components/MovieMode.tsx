'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildReel, kenBurns, type Segment } from '@/lib/client/reel'
import { MusicBed, MUSIC_LEVEL, MUSIC_LEVEL_QUIET } from '@/lib/client/music'
import { VideoFrame } from '@/components/VideoFrame'
import { fullDate } from '@/lib/format'
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
}: {
  flavors: Flavor[]
  initialMedia: MediaView[]
}) {
  const router = useRouter()
  const [flavor, setFlavor] = useState<Flavor>({ kind: 'everything', label: 'Everything' })
  const [media, setMedia] = useState<MediaView[]>(initialMedia)
  const [quiet, setQuiet] = useState(false)
  const [started, setStarted] = useState(false)
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

  const reel = useMemo(
    () => buildReel(media, { quiet, shuffle: flavor.kind === 'everything' }),
    [media, quiet, flavor.kind],
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
        flavors={flavors}
        flavor={flavor}
        quiet={quiet}
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
      {segment && <Frame segment={segment} index={index} kind="incoming" />}

      <Controls
        visible={showControls}
        playing={playing}
        flavor={flavor}
        flavors={flavors}
        quiet={quiet}
        loading={loading}
        onPlayPause={() => setPlaying((p) => !p)}
        onSkip={() => advance(1)}
        onBack={() => advance(-1)}
        onFlavor={choose}
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
}: {
  segment: Segment
  index: number
  kind: 'incoming' | 'outgoing'
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
          title={media.caption ?? 'Memory'}
        />
      ) : media.display_url ? (
        <img
          src={media.display_url}
          alt=""
          className={`h-full w-full object-cover ${kenBurns(index)}`}
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
          <p className="mt-2 text-[clamp(0.7rem,1.2vw,0.95rem)] tracking-[0.2em] text-paper-dim uppercase">
            {fullDate(media.taken_at)}
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function StartScreen({
  count,
  flavors,
  flavor,
  quiet,
  loading,
  onQuiet,
  onFlavor,
  onStart,
}: {
  count: number
  flavors: Flavor[]
  flavor: Flavor
  quiet: boolean
  loading: boolean
  onQuiet: (value: boolean) => void
  onFlavor: (flavor: Flavor) => void
  onStart: () => void
}) {
  return (
    <div className="lamplight relative flex min-h-dvh flex-col justify-center px-6 py-20 sm:px-12">
      <div className="mx-auto w-full max-w-3xl">
        <p className="mb-4 text-xs tracking-[0.35em] text-paper-faint uppercase">Movie mode</p>
        <h1 className="font-display text-[clamp(3rem,11vw,7rem)] leading-[0.9] text-balance">
          Put it on
          <br />
          <span className="text-paper-dim italic">the big screen.</span>
        </h1>

        <p className="mt-8 max-w-lg text-lg text-paper-soft text-balance">
          {count > 0
            ? `${count} ${count === 1 ? 'memory' : 'memories'}, cut together — photos drifting, videos playing, music underneath.`
            : 'Add a few memories first and this turns into something worth sitting down for.'}
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
                      ? 'border-ember bg-ember text-[#1a1105]'
                      : 'border-edge-strong text-paper-soft hover:bg-ink-hover hover:text-paper'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <label className="mt-8 flex w-fit cursor-pointer items-center gap-3 text-sm text-paper-soft">
          <input
            type="checkbox"
            checked={quiet}
            onChange={(event) => onQuiet(event.target.checked)}
            className="h-4 w-4 accent-[#d99b52]"
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
  loading,
  onPlayPause,
  onSkip,
  onBack,
  onFlavor,
  onQuiet,
  onExit,
}: {
  visible: boolean
  playing: boolean
  flavor: Flavor
  flavors: Flavor[]
  quiet: boolean
  loading: boolean
  onPlayPause: () => void
  onSkip: () => void
  onBack: () => void
  onFlavor: (flavor: Flavor) => void
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

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 px-1 text-sm text-white/60">
            <input
              type="checkbox"
              checked={quiet}
              onChange={(event) => onQuiet(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#d99b52]"
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
