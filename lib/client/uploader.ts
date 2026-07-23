'use client'

import * as tus from 'tus-js-client'
import { classify, preparePhoto, type Kind } from '@/lib/client/media-prep'
import type { CropMetadata } from '@/lib/types'

/**
 * The upload queue.
 *
 * Bytes go phone → Cloudflare, never through our server. Videos take the tus
 * road (resumable, survives a dropped bar of signal); photos take a presigned
 * PUT straight to R2.
 *
 * Two at a time — a phone's uplink is the bottleneck, and eight parallel
 * uploads just makes all eight slow.
 */

export type ItemStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'duplicate'
  | 'error'

export interface UploadItem {
  id: string
  file: File
  kind: Kind
  status: ItemStatus
  /** 0–1 for the byte transfer itself. */
  progress: number
  mediaId?: string
  previewUrl?: string
  /** True when previewUrl came from URL.createObjectURL and must be revoked. */
  ownsPreviewUrl?: boolean
  contentHash?: string
  crop?: CropMetadata | null
  durationSeconds?: number | null
  uploadUrl?: string
  context: UploadContext
  duplicateOf?: string
  error?: string
}

export interface UploadDraft {
  file: File
  previewUrl?: string
  contentHash?: string
  crop?: CropMetadata | null
  durationSeconds?: number | null
}

/** The shared caption/tags/event a batch was given on the upload screen. */
export interface UploadDetails {
  caption?: string
  people?: { name: string }[]
  eventId?: string | null
  takenAt?: string
  location?: string
}

export interface UploadContext {
  eventId?: string | null
  /** Present when uploading through a public event link instead of an account. */
  linkToken?: string | null
  uploaderLabel?: string | null
  /** Applied to every item in this batch the moment its row exists. */
  details?: UploadDetails
}

const MAX_CONCURRENT = 2

/**
 * Cloudflare wants >= 5 MiB, a multiple of 256 KiB, <= 200 MiB, and recommends
 * 50 MiB on reliable connections. On a phone in a backyard, a failed 50 MiB
 * chunk is a painful thing to redo — so drop to 10 MiB when the connection
 * looks slow.
 */
function chunkSize(): number {
  const connection = (
    navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }
  ).connection
  const slow =
    connection?.saveData === true ||
    (connection?.effectiveType != null && connection.effectiveType !== '4g')
  return slow ? 10_485_760 : 52_428_800
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Something went wrong on our side. Try again?')
  }
  return payload as T
}

export class UploadQueue {
  private items: UploadItem[] = []
  private listeners = new Set<(items: UploadItem[]) => void>()
  private running = 0
  private aborters = new Map<string, () => void>()

  subscribe(listener: (items: UploadItem[]) => void): () => void {
    this.listeners.add(listener)
    listener(this.items)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    this.items = [...this.items]
    for (const listener of this.listeners) listener(this.items)
  }

  private patch(id: string, changes: Partial<UploadItem>) {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    Object.assign(item, changes)
    this.emit()
  }

  add(drafts: UploadDraft[], context: UploadContext = {}) {
    for (const draft of drafts) {
      const file = draft.file
      this.items.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind: classify(file),
        status: 'queued',
        progress: 0,
        previewUrl: draft.previewUrl,
        ownsPreviewUrl: Boolean(draft.previewUrl),
        contentHash: draft.contentHash,
        crop: draft.crop,
        durationSeconds: draft.durationSeconds,
        context,
      })
    }
    this.emit()
    this.pump()
  }

  retry(id: string) {
    this.patch(id, { status: 'queued', progress: 0, error: undefined })
    this.pump()
  }

  remove(id: string) {
    this.aborters.get(id)?.()
    this.aborters.delete(id)
    const item = this.items.find((i) => i.id === id)
    if (item?.previewUrl && item.ownsPreviewUrl) URL.revokeObjectURL(item.previewUrl)
    this.items = this.items.filter((i) => i.id !== id)
    this.emit()
    this.pump()
  }

  /**
   * Drops finished rows. Errors are kept unless `includeErrors` — a failed
   * upload that quietly vanishes is worse than one that sits there asking to be
   * retried.
   */
  clearFinished(options: { includeErrors?: boolean } = {}) {
    const isFinished = (item: UploadItem) =>
      item.status === 'ready' || item.status === 'duplicate' || (options.includeErrors && item.status === 'error')

    for (const item of this.items) {
      if (isFinished(item) && item.previewUrl && item.ownsPreviewUrl) URL.revokeObjectURL(item.previewUrl)
    }
    this.items = this.items.filter((item) => !isFinished(item))
    this.emit()
  }

  get pendingCount(): number {
    return this.items.filter((i) => !['ready', 'duplicate', 'error'].includes(i.status)).length
  }

  private pump() {
    while (this.running < MAX_CONCURRENT) {
      const next = this.items.find((i) => i.status === 'queued')
      if (!next) return
      this.running += 1
      void this.run(next).finally(() => {
        this.running -= 1
        this.pump()
      })
    }
  }

  /**
   * Applies the batch's shared caption/tags/event, the moment a row exists —
   * not once bytes finish, so it's set even if someone closes the tab mid
   * upload. Best-effort: the memory is already safely in the archive either
   * way, and these can always be added from its detail page.
   */
  private async applyDetails(mediaId: string, item: UploadItem) {
    const details = item.context.details
    if (!details) return
    const caption = details.caption?.trim()
    const people = details.people?.filter((p) => p.name.trim())
    const eventId = details.eventId
    const location = details.location?.trim()

    const patch: Record<string, unknown> = {}
    if (caption) patch.caption = caption
    if (people && people.length > 0) patch.people = people.map((p) => p.name)
    if (eventId) patch.eventId = eventId
    if (details.takenAt) patch.takenAt = details.takenAt
    if (location) patch.location = location
    if (Object.keys(patch).length === 0) return

    try {
      await fetch(`/api/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch (error) {
      console.error('[reel] could not apply upload details', { mediaId, error })
    }
  }

  private async run(item: UploadItem) {
    try {
      this.patch(item.id, { status: 'preparing' })
      if (item.kind === 'video') await this.uploadVideo(item)
      else await this.uploadPhoto(item)
    } catch (error) {
      this.patch(item.id, {
        status: 'error',
        error: error instanceof Error ? error.message : 'That one did not make it.',
      })
    } finally {
      this.aborters.delete(item.id)
    }
  }

  private async uploadPhoto(item: UploadItem) {
    const prepared = await preparePhoto(item.file, item.crop)
    if (item.previewUrl && item.ownsPreviewUrl) URL.revokeObjectURL(item.previewUrl)
    this.patch(item.id, { previewUrl: prepared.previewUrl, ownsPreviewUrl: true })

    const response = await postJson<{
      mediaId: string
      duplicate?: boolean
      put?: { original: string; display: string; thumb: string }
    }>('/api/upload/photo', {
      ...item.context,
      filename: item.file.name,
      contentType: item.file.type || 'application/octet-stream',
      size: item.file.size,
      width: prepared.width,
      height: prepared.height,
      takenAt: prepared.takenAt.toISOString(),
      contentHash: item.contentHash,
      cropMetadata: item.crop ?? null,
      displayType: prepared.display.type,
      thumbType: prepared.thumb.type,
    })

    if (response.duplicate || !response.put) {
      this.patch(item.id, {
        mediaId: response.mediaId,
        duplicateOf: response.mediaId,
        status: 'duplicate',
        progress: 1,
      })
      return
    }
    const { mediaId, put } = response

    this.patch(item.id, { mediaId, status: 'uploading' })
    void this.applyDetails(mediaId, item)

    // The original goes up untouched — that's what "download original" hands back.
    const parts: [string, Blob, string][] = [
      [put.original, item.file, item.file.type || 'application/octet-stream'],
      [put.display, prepared.display, prepared.display.type],
      [put.thumb, prepared.thumb, prepared.thumb.type],
    ]

    let done = 0
    for (const [url, blob, contentType] of parts) {
      let response: Response
      try {
        // Content-Type is part of the signature: send anything else and R2
        // answers 403 SignatureDoesNotMatch.
        response = await fetch(url, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': contentType },
        })
      } catch (networkError) {
        // A rejected PUT — not a bad status, an actual thrown error. This used
        // to be hardcoded to "it's probably CORS", which was a guess, not a
        // diagnosis — and it kept showing that same guess even after CORS was
        // fixed, hiding whatever the real, still-live cause was. Show the
        // browser's own error text instead: it's the one piece of this whole
        // pipeline that's actually visible without server log access.
        const detail =
          networkError instanceof Error
            ? `${networkError.name}: ${networkError.message}`
            : String(networkError)
        console.error('[reel] photo PUT rejected before getting a response', {
          key: url.split('?')[0],
          contentType,
          error: networkError,
        })
        throw new Error(`Photos could not reach cloud storage (${detail}). Try again in a moment.`)
      }
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? 'The upload link expired before this finished. Try again.'
            : `The photo did not upload (${response.status}).`,
        )
      }
      done += 1
      this.patch(item.id, { progress: done / parts.length })
    }

    await postJson(`/api/media/${mediaId}/ready`, {
      linkToken: item.context.linkToken ?? null,
    })
    this.patch(item.id, { status: 'ready', progress: 1 })
  }

  private async uploadVideo(item: UploadItem) {
    let mediaId = item.mediaId
    let uploadUrl = item.uploadUrl
    if (!mediaId || !uploadUrl) {
      const response = await postJson<{
        mediaId: string
        uploadUrl?: string
        duplicate?: boolean
      }>('/api/upload/video', {
        ...item.context,
        filename: item.file.name,
        size: item.file.size,
        contentType: item.file.type || null,
        takenAt: item.context.details?.takenAt ?? new Date(item.file.lastModified).toISOString(),
        contentHash: item.contentHash,
      })
      if (response.duplicate || !response.uploadUrl) {
        this.patch(item.id, {
          mediaId: response.mediaId,
          duplicateOf: response.mediaId,
          status: 'duplicate',
          progress: 1,
        })
        return
      }
      mediaId = response.mediaId
      uploadUrl = response.uploadUrl
    }

    this.patch(item.id, { mediaId, uploadUrl, status: 'uploading' })
    void this.applyDetails(mediaId, item)

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(item.file, {
        uploadUrl,
        chunkSize: chunkSize(),
        // Ride out a lift ride, a dead spot, a switch from wifi to LTE.
        retryDelays: [0, 3000, 8000, 15000, 30000, 60000],
        onProgress: (sent, total) => {
          this.patch(item.id, { progress: total ? sent / total : 0 })
        },
        onSuccess: () => resolve(),
        onError: (error) => reject(new Error(friendlyTusError(error))),
      })

      this.aborters.set(item.id, () => void upload.abort())
      upload.start()
    })

    // Bytes are in; Cloudflare still has to transcode it for every screen.
    this.patch(item.id, { status: 'processing', progress: 1 })
    await this.waitForProcessing(item, mediaId)
  }

  private async waitForProcessing(item: UploadItem, mediaId: string) {
    // Backs off from 2s to 10s — most clips are ready inside a minute, but a
    // long 4K video legitimately takes a while and shouldn't be hammered.
    let delay = 2000
    const deadline = Date.now() + 45 * 60 * 1000

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 1.35, 10_000)

      try {
        // The token has to ride along: someone uploading through a drop-off
        // link has no session, and without it every poll 401s. That route is
        // the only thing that ever marks a video ready, so the memory would
        // stay invisible forever.
        const query = item.context.linkToken
          ? `?token=${encodeURIComponent(item.context.linkToken)}`
          : ''
        const response = await fetch(`/api/media/${mediaId}/status${query}`, {
          cache: 'no-store',
        })
        if (!response.ok) continue
        const data = (await response.json()) as {
          status: ItemStatus
          error?: string
        }
        if (data.status === 'ready') {
          this.patch(item.id, { status: 'ready' })
          return
        }
        if (data.status === 'error') {
          throw new Error(data.error || 'Cloudflare could not process that video.')
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('could not process')) throw error
        // A transient network error while polling is not an upload failure.
      }
    }

    // Still not done — leave it processing rather than crying wolf. The feed
    // picks it up whenever Cloudflare finishes.
    this.patch(item.id, { status: 'processing' })
  }
}

function friendlyTusError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/network|failed to fetch|connection/i.test(text)) {
    return 'The connection dropped. It will pick up where it left off — try again.'
  }
  if (/413|too large/i.test(text)) return 'That video is larger than the archive allows.'
  return 'That video did not finish uploading. Try again?'
}
