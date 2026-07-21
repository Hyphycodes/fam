import 'server-only'

import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { isConfigured, missing, require_ } from '@/lib/env'

/**
 * R2 access.
 *
 * The bucket is private. Nothing is ever served from a public URL — the app
 * hands out short-lived signed links, one per file, per view.
 *
 * Presigning is pure local HMAC (no network call), so signing a whole page of
 * feed images costs nothing measurable.
 */

let client: S3Client | null = null

function s3(): S3Client {
  if (client) return client
  const endpoint = require_('R2_ENDPOINT')

  // The SDK's own failure here is a bare `TypeError: Invalid URL` with no
  // indication of which env var or what was actually wrong with it — exactly
  // the kind of dead-end error this codebase keeps tripping over. Catch it
  // once, here, so every caller (uploads, the health check) gets a message
  // that names the variable and shows the value that didn't parse.
  try {
    new URL(endpoint)
  } catch {
    throw new Error(
      `R2_ENDPOINT is not a valid URL: "${endpoint}". It should look like ` +
        `https://<account-id>.r2.cloudflarestorage.com — check it in Vercel's ` +
        `Environment Variables (a missing "https://", a leftover "<...>" ` +
        `placeholder, or a stray space are the usual causes).`,
    )
  }

  client = new S3Client({
    // R2 ignores region, but the SDK insists on one.
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: require_('R2_ACCESS_KEY_ID'),
      secretAccessKey: require_('R2_SECRET_ACCESS_KEY'),
    },
    // Without this, the SDK's default virtual-hosted-style addressing signs
    // URLs as `<bucket>.<account-id>.r2.cloudflarestorage.com/<key>`. R2's
    // S3-compatible API is built around path-style — `<account-id>.r2.
    // cloudflarestorage.com/<bucket>/<key>` — and virtual-hosted-style
    // requests are unreliable against it. Confirmed locally: the SDK signs a
    // perfectly plausible-looking URL either way, so this fails silently
    // until something actually tries to use it — it never throws here.
    forcePathStyle: true,
  })
  return client
}

const bucket = () => require_('R2_BUCKET_NAME')

export type Variant = 'original' | 'display' | 'thumb' | 'voice' | 'music'

/**
 * Object keys are grouped by variant then by date, which keeps the bucket
 * browsable by a human going through it in five years.
 */
export function buildKey(opts: {
  variant: Variant
  mediaId: string
  filename: string
  takenAt?: Date
}): string {
  const when = opts.takenAt ?? new Date()
  const yyyy = when.getUTCFullYear()
  const mm = String(when.getUTCMonth() + 1).padStart(2, '0')
  const safe = sanitizeFilename(opts.filename)
  return `${opts.variant}/${yyyy}/${mm}/${opts.mediaId}-${safe}`
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '')
  return (cleaned || 'file').slice(-120)
}

/**
 * A presigned PUT the phone uses to upload straight to R2.
 *
 * `contentType` is part of the signature — the browser MUST send exactly this
 * same value on the PUT or R2 answers 403 SignatureDoesNotMatch.
 */
export function presignPut(
  key: string,
  contentType: string,
  expiresIn = 60 * 30,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  )
}

/**
 * Default expiry is 12 hours — long enough that a tab left open all evening
 * (Movie Mode on the projector, the feed on someone's iPad) never watches its
 * own images 403. Still short enough that a leaked link goes stale by morning.
 */
export function presignGet(
  key: string,
  opts: { expiresIn?: number; downloadAs?: string } = {},
): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(opts.downloadAs
        ? {
            ResponseContentDisposition: `attachment; filename="${sanitizeFilename(
              opts.downloadAs,
            )}"`,
          }
        : {}),
    }),
    { expiresIn: opts.expiresIn ?? 60 * 60 * 12 },
  )
}

/** Signs a batch of keys concurrently, tolerating nulls for a cleaner call site. */
export async function presignMany(
  keys: (string | null | undefined)[],
  expiresIn = 60 * 60 * 12,
): Promise<(string | null)[]> {
  return Promise.all(
    keys.map((key) => (key ? presignGet(key, { expiresIn }) : Promise.resolve(null))),
  )
}

export interface R2Health {
  configured: boolean
  missingVars: string[]
  reachable: boolean
  error?: string
  /** The actual runtime values in this deployment, not the dashboard's copy —
   *  the point is to catch a value that's wrong *here* even if it looks right
   *  in Vercel's settings page. Endpoint is truncated to its host; nothing
   *  secret is ever included. */
  bucket?: string
  endpointHost?: string
  /** A live peek at the bucket's contents, so "is anything landing here" is
   *  answered by the app itself instead of a separate dashboard visit. */
  objectCount?: number
  sampleKeys?: string[]
}

/**
 * A real, live check — not "are the env vars present" but "does R2 actually
 * answer to them, for the exact bucket and endpoint this deployment is
 * configured with". Presigning is pure local HMAC math, so a bad credential,
 * wrong bucket name, or nonexistent bucket never shows up there; this is the
 * one call in this file that actually reaches Cloudflare, which is what makes
 * it a genuine diagnostic instead of another guess.
 */
export async function checkR2Health(): Promise<R2Health> {
  if (!isConfigured('r2')) {
    return { configured: false, missingVars: missing('r2'), reachable: false }
  }

  const bucketName = bucket()
  const endpointHost = (() => {
    try {
      return new URL(require_('R2_ENDPOINT')).host
    } catch {
      return require_('R2_ENDPOINT')
    }
  })()

  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucketName }))

    // A separate try: an R2 token scoped to Object Read & Write may not carry
    // ListBucket. If this fails, the bucket is still reachable — we just
    // can't show a live count, which beats calling the whole thing broken.
    let objectCount: number | undefined
    let sampleKeys: string[] | undefined
    try {
      const listed = await s3().send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 5 }))
      objectCount = listed.KeyCount ?? listed.Contents?.length ?? 0
      sampleKeys = (listed.Contents ?? []).map((o) => o.Key ?? '').filter(Boolean)
    } catch {
      // Listing isn't required for uploads to work — leave it unset.
    }

    return {
      configured: true,
      missingVars: [],
      reachable: true,
      bucket: bucketName,
      endpointHost,
      objectCount,
      sampleKeys,
    }
  } catch (error) {
    return {
      configured: true,
      missingVars: [],
      reachable: false,
      bucket: bucketName,
      endpointHost,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}
