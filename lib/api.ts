import 'server-only'

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getViewer } from '@/lib/viewer'
import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = SupabaseClient<any, any, any>

export function ok<T>(data: T) {
  return NextResponse.json(data)
}

/** Error bodies are read by a person, not a machine — keep them plain. */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  // A missing env var is a setup problem, and saying so saves an hour.
  if (/^Missing [A-Z_]+\./.test(message)) {
    console.error('[reel] configuration error:', message)
    return fail(message, 503)
  }
  console.error('[reel]', error)
  return fail('Something went wrong on our side. Try again in a moment.', 500)
}

/**
 * Who is uploading, and where does it land?
 *
 * Two legitimate answers: a signed-in family member, or someone holding a valid
 * event-upload link ("Add your photos from the Water Party") who has no account
 * at all. Anything else is turned away.
 */
export type Uploader =
  | {
      kind: 'member'
      db: DB
      /** Legacy magic-link account id, or null for a passcode member. */
      uploaderId: string | null
      /** Passcode member id, or null for a legacy account. */
      uploaderMember: string | null
      label: null
      eventId: string | null
      linkId: null
    }
  | {
      kind: 'link'
      db: DB
      uploaderId: null
      uploaderMember: null
      label: string
      eventId: string
      linkId: string
    }

export async function resolveUploader(body: {
  linkToken?: string | null
  uploaderLabel?: string | null
  eventId?: string | null
}): Promise<Uploader | { error: string; status: number }> {
  const viewer = await getViewer()

  if (viewer) {
    // Access is already validated; the service role sets attribution explicitly
    // (a passcode member has no auth.uid() for RLS to key on).
    return {
      kind: 'member',
      db: createAdminClient(),
      uploaderId: viewer.kind === 'legacy' ? viewer.id : null,
      uploaderMember: viewer.kind === 'member' ? viewer.memberId : null,
      label: null,
      eventId: body.eventId ?? null,
      linkId: null,
    }
  }

  const token = body.linkToken?.trim()
  if (!token) return { error: 'You need to be signed in to add memories.', status: 401 }

  // No session, so the token itself is the credential — check it with the
  // service role, then never trust anything else the caller said.
  const admin = createAdminClient()
  const { data: link } = await admin
    .from('event_upload_links')
    .select('id, event_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!link) return { error: 'That upload link is not valid.', status: 403 }
  if (link.revoked_at) return { error: 'That upload link has been turned off.', status: 403 }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { error: 'That upload link has expired.', status: 403 }
  }

  const label = (body.uploaderLabel ?? '').trim().slice(0, 60)
  return {
    kind: 'link',
    db: admin,
    uploaderId: null,
    uploaderMember: null,
    label: label || 'A friend of the family',
    // The link decides the event — not the request body.
    eventId: link.event_id,
    linkId: link.id,
  }
}

export function isUploader(value: Uploader | { error: string }): value is Uploader {
  return !('error' in value)
}

/**
 * Confirms the caller may write to this media row: they uploaded it, they're
 * the owner, or they hold the upload link that created it.
 */
export async function canWriteMedia(
  mediaId: string,
  uploader: Uploader,
): Promise<boolean> {
  const { data } = await uploader.db
    .from('media')
    .select('uploader_id, uploader_member, upload_link_id')
    .eq('id', mediaId)
    .maybeSingle()

  if (!data) return false

  // A link may only finish what that same link started. Matching on the event
  // instead would let anyone holding the link reach in and mark a family
  // member's still-uploading memory as ready.
  if (uploader.kind === 'link') return data.upload_link_id === uploader.linkId

  const rowWithMember = data as { uploader_id: string | null; uploader_member?: string | null }
  const mine = uploader.uploaderMember
    ? rowWithMember.uploader_member === uploader.uploaderMember
    : rowWithMember.uploader_id === uploader.uploaderId
  return mine || (await isOwner())
}

async function isOwner(): Promise<boolean> {
  const viewer = await getViewer()
  return viewer?.role === 'owner'
}

/** Parses a JSON body without throwing on empty or malformed input. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return {} as T
  }
}
