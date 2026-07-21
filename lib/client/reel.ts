'use client'

import { season } from '@/lib/format'
import type { MediaView } from '@/lib/types'

/**
 * Cutting the reel.
 *
 * This is the editing decision, kept away from the rendering: how long each
 * thing holds, where a title card earns its place, and what order it all runs
 * in. Everything that makes it feel like a short film instead of a slideshow
 * is a number in this file.
 */

export type Segment =
  | { kind: 'media'; id: string; media: MediaView; ms: number }
  | { kind: 'title'; id: string; title: string; sub?: string; ms: number }

export interface ReelOptions {
  /** Dinner-party mode: longer holds, no title cards, softer music. */
  quiet?: boolean
  shuffle?: boolean
}

/** Photos hold long enough to actually look at. */
const PHOTO_MS = 5200
const PHOTO_MS_QUIET = 7600
/** A video's "strong stretch" — long enough to land, short enough to keep moving. */
const VIDEO_MS = 12_500
const TITLE_MS = 3400

/** Never two title cards close together, however much the metadata changes. */
const MIN_ITEMS_BETWEEN_TITLES = 6

export function buildReel(input: MediaView[], options: ReelOptions = {}): Segment[] {
  const items = options.shuffle ? shuffle(input) : [...input]
  const segments: Segment[] = []
  let sinceTitle = MIN_ITEMS_BETWEEN_TITLES
  let lastChapter: string | null = null

  items.forEach((media, index) => {
    const chapter = chapterOf(media)

    if (
      !options.quiet &&
      chapter !== lastChapter &&
      sinceTitle >= MIN_ITEMS_BETWEEN_TITLES
    ) {
      segments.push({
        kind: 'title',
        id: `title-${index}-${chapter}`,
        title: media.event_name ?? season(media.taken_at),
        sub: media.event_name ? season(media.taken_at) : undefined,
        ms: TITLE_MS,
      })
      sinceTitle = 0
    }

    lastChapter = chapter
    sinceTitle += 1

    segments.push({
      kind: 'media',
      id: media.id,
      media,
      ms:
        media.type === 'video'
          ? // Don't hold a 4-second clip for twelve seconds of black.
            Math.min(VIDEO_MS, Math.max(4000, (media.duration_seconds ?? 12) * 1000))
          : options.quiet
            ? PHOTO_MS_QUIET
            : // A little variance so the rhythm breathes instead of ticking.
              PHOTO_MS + ((index * 617) % 1400) - 700,
    })
  })

  return segments
}

/** An event if there is one, otherwise the season it happened in. */
function chapterOf(media: MediaView): string {
  return media.event_name ?? season(media.taken_at)
}

function shuffle<T>(input: T[]): T[] {
  const items = [...input]
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** Four drift paths, cycled so neighbouring photos never move the same way. */
export function kenBurns(index: number): string {
  return ['kb-a', 'kb-b', 'kb-c', 'kb-d'][index % 4]
}
