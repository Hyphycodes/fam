'use client'

/**
 * The music bed, and the duck.
 *
 * When a video with its own audio comes up the music slides down under it and
 * swells back on the next photo. Ramped, never stepped — a volume jump is the
 * single most obvious tell that you're watching software.
 */

export const MUSIC_LEVEL = 0.5
export const MUSIC_LEVEL_QUIET = 0.28
export const DUCKED_LEVEL = 0.1

const RAMP_MS = 700

/**
 * Owns volume only. Which track is playing is React state — mixing the two
 * would mean reading mutable instance state during render.
 */
export class MusicBed {
  private audio: HTMLAudioElement | null = null
  private ramp: number | null = null
  private base = MUSIC_LEVEL

  attach(audio: HTMLAudioElement | null) {
    this.audio = audio
    if (audio) audio.volume = 0
  }

  setBaseLevel(level: number) {
    this.base = level
  }

  duck() {
    this.rampTo(Math.min(DUCKED_LEVEL, this.base))
  }

  swell() {
    this.rampTo(this.base)
  }

  silence() {
    this.rampTo(0)
  }

  private rampTo(target: number) {
    const audio = this.audio
    if (!audio) return
    if (this.ramp) window.clearInterval(this.ramp)

    const from = audio.volume
    const started = performance.now()

    this.ramp = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / RAMP_MS)
      // Ease-out so the last part of the move is gentle.
      const eased = 1 - (1 - t) ** 3
      audio.volume = clamp(from + (target - from) * eased)
      if (t >= 1 && this.ramp) {
        window.clearInterval(this.ramp)
        this.ramp = null
      }
    }, 40)
  }

  dispose() {
    if (this.ramp) window.clearInterval(this.ramp)
    this.ramp = null
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
