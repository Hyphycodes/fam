import 'server-only'

import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import { require_, streamCustomerCode, streamSigningKey } from '@/lib/env'

/**
 * Cloudflare Stream.
 *
 * Video never touches our server. We ask Stream for a one-time upload URL and
 * the phone pushes bytes straight there over tus (resumable) — a 4GB camcorder
 * file would blow every serverless timeout there is if we proxied it.
 */

const API = 'https://api.cloudflare.com/client/v4'

const accountId = () => require_('CLOUDFLARE_ACCOUNT_ID')
const apiToken = () => require_('CLOUDFLARE_STREAM_API_TOKEN')

/**
 * tus chunk size. Cloudflare requires >= 5 MiB, a multiple of 256 KiB, and
 * <= 200 MiB. 50 MiB is their recommendation for reliable connections; it is
 * also 200 * 256 KiB, so the divisibility rule holds.
 */
export const TUS_CHUNK_SIZE = 52_428_800

/** `key value` pairs, base64 values, comma-separated, no spaces around commas. */
function encodeUploadMetadata(entries: Record<string, string | true | undefined>): string {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      // A bare key with no value is how Stream expresses a boolean flag.
      value === true ? key : `${key} ${Buffer.from(String(value), 'utf8').toString('base64')}`,
    )
    .join(',')
}

export interface DirectUpload {
  uploadUrl: string
  uid: string
}

/**
 * Creates a one-time, credential-free tus endpoint the browser can upload to.
 *
 * Note the metadata keys are lowercase: Stream silently files unrecognised keys
 * under `meta` rather than erroring, so `maxDurationSeconds` would look like it
 * worked while doing nothing.
 */
export async function createDirectUpload(opts: {
  uploadLength: number
  name?: string
  maxDurationSeconds?: number
}): Promise<DirectUpload> {
  const metadata = encodeUploadMetadata({
    name: opts.name,
    maxdurationseconds: String(opts.maxDurationSeconds ?? 60 * 60 * 4),
    // Only mark videos private when we can actually mint playback tokens,
    // otherwise every video would 403 for the whole family.
    requiresignedurls: streamSigningKey() ? true : undefined,
  })

  const response = await fetch(`${API}/accounts/${accountId()}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(opts.uploadLength),
      'Upload-Metadata': metadata,
    },
  })

  if (!response.ok) {
    throw new Error(
      `Cloudflare Stream refused the upload (${response.status}): ${await response.text()}`,
    )
  }

  const uploadUrl = response.headers.get('Location')
  // Cloudflare explicitly warns against parsing the UID out of the URL.
  const uid = response.headers.get('stream-media-id')

  if (!uploadUrl || !uid) {
    throw new Error('Cloudflare Stream did not return an upload URL and media id.')
  }

  return { uploadUrl, uid }
}

export interface StreamVideo {
  uid: string
  readyToStream: boolean
  state: string
  pctComplete: number | null
  errorReasonCode: string | null
  errorReasonText: string | null
  duration: number | null
  width: number | null
  height: number | null
  size: number | null
}

export async function getVideo(uid: string): Promise<StreamVideo | null> {
  const response = await fetch(`${API}/accounts/${accountId()}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${apiToken()}` },
    cache: 'no-store',
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Could not read video ${uid} from Stream (${response.status}).`)
  }

  const { result } = (await response.json()) as { result: Record<string, never> }
  const r = result as Record<string, unknown>
  const status = (r.status ?? {}) as Record<string, unknown>
  // pctComplete comes back as a string, not a number.
  const pct = status.pctComplete != null ? Number(status.pctComplete) : null
  const input = (r.input ?? {}) as Record<string, unknown>
  const dimension = (value: unknown) => {
    const n = typeof value === 'number' ? value : null
    return n != null && n > 0 ? n : null // Stream uses -1 for "not known yet"
  }
  const duration = typeof r.duration === 'number' && r.duration >= 0 ? r.duration : null

  return {
    uid: String(r.uid ?? uid),
    readyToStream: r.readyToStream === true,
    state: String(status.state ?? 'unknown'),
    pctComplete: pct != null && Number.isFinite(pct) ? pct : null,
    errorReasonCode: (status.errorReasonCode as string) || null,
    errorReasonText: (status.errorReasonText as string) || null,
    duration,
    width: dimension(input.width),
    height: dimension(input.height),
    size: typeof r.size === 'number' ? r.size : null,
  }
}

export async function deleteVideo(uid: string): Promise<void> {
  await fetch(`${API}/accounts/${accountId()}/stream/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiToken()}` },
  })
}

// ---------------------------------------------------------------------------
// Signed playback
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/**
 * Importing an RSA key is expensive, and Movie Mode signs a few hundred videos
 * in one request. Do it once per process.
 */
let cachedKey: { id: string; privateKey: ReturnType<typeof createPrivateKey> } | null = null

function signingKey() {
  const key = streamSigningKey()
  if (!key) return null
  if (cachedKey?.id === key.id) return cachedKey

  // Cloudflare returns the JWK base64-encoded; it must be decoded before use.
  const jwk = JSON.parse(Buffer.from(key.jwk, 'base64').toString('utf8'))
  cachedKey = { id: key.id, privateKey: createPrivateKey({ key: jwk, format: 'jwk' }) }
  return cachedKey
}

/**
 * Mints a playback token for one video.
 *
 * The header carries only `alg` and `kid` — matching Cloudflare's own example
 * rather than a generic JWT library's output. Returns null when no signing key
 * is configured, which is the "videos are public by UID" mode.
 */
/**
 * 12 hours, not 2: Movie Mode runs unattended on a projector all evening, and
 * a video that 403s three hours into the cookout is the worst possible way to
 * find out tokens expire. (Stream caps validity at 24h.)
 */
export function signPlaybackToken(uid: string, ttlSeconds = 60 * 60 * 12): string | null {
  const key = signingKey()
  if (!key) return null
  const { privateKey } = key

  const header = { alg: 'RS256', kid: key.id }
  const payload = {
    sub: uid,
    kid: key.id,
    // Stream rejects anything more than 24h out.
    exp: Math.floor(Date.now() / 1000) + Math.min(ttlSeconds, 60 * 60 * 23),
    nbf: Math.floor(Date.now() / 1000) - 60,
  }

  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = cryptoSign('RSA-SHA256', Buffer.from(body), privateKey)
  return `${body}.${base64url(signature)}`
}

export interface PlaybackUrls {
  hls: string
  dash: string
  poster: string
  iframe: string
  mp4: string
}

/**
 * When a video requires signed URLs the token replaces the UID in the path —
 * there is no query parameter form.
 */
export function playbackUrls(uid: string, opts: { posterTime?: string } = {}): PlaybackUrls {
  const base = `https://customer-${streamCustomerCode()}.cloudflarestream.com`
  const ref = signPlaybackToken(uid) ?? uid
  const time = opts.posterTime ?? '1s'
  return {
    hls: `${base}/${ref}/manifest/video.m3u8`,
    dash: `${base}/${ref}/manifest/video.mpd`,
    poster: `${base}/${ref}/thumbnails/thumbnail.jpg?time=${encodeURIComponent(time)}&height=1080`,
    iframe: `${base}/${ref}/iframe`,
    mp4: `${base}/${ref}/downloads/default.mp4`,
  }
}
