import 'server-only'

import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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
  client = new S3Client({
    // R2 ignores region, but the SDK insists on one.
    region: 'auto',
    endpoint: require_('R2_ENDPOINT'),
    credentials: {
      accessKeyId: require_('R2_ACCESS_KEY_ID'),
      secretAccessKey: require_('R2_SECRET_ACCESS_KEY'),
    },
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
}

/**
 * A real, live check — not "are the env vars present" but "does R2 actually
 * answer to them". Presigning is pure local HMAC math, so a bad credential or
 * a nonexistent bucket never shows up there; this is the one call in this
 * file that actually reaches Cloudflare, which is what makes it a genuine
 * diagnostic instead of another guess.
 */
export async function checkR2Health(): Promise<R2Health> {
  if (!isConfigured('r2')) {
    return { configured: false, missingVars: missing('r2'), reachable: false }
  }
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }))
    return { configured: true, missingVars: [], reachable: true }
  } catch (error) {
    return {
      configured: true,
      missingVars: [],
      reachable: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}
