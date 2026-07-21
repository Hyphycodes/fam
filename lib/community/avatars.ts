/**
 * Avatar URLs.
 *
 * The `avatars` bucket is public (within an already-private app), so a stored
 * path becomes a plain CDN URL with no signing round-trip — which keeps a
 * screen full of little avatars cheap on a phone. Paths are unguessable
 * (`<member-id>/<random>.jpg`), so "public" only means "no signature", not
 * "listable".
 */

const AVATAR_BUCKET = 'avatars'
const FLYER_BUCKET = 'flyers'

/** A public-bucket object path becomes a plain CDN URL. */
export function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!base) return null
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

export function avatarUrl(path: string | null | undefined): string | null {
  return publicStorageUrl(AVATAR_BUCKET, path)
}

export function flyerUrl(path: string | null | undefined): string | null {
  return publicStorageUrl(FLYER_BUCKET, path)
}

export { AVATAR_BUCKET, FLYER_BUCKET }
