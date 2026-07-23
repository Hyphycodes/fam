import { randomUUID } from 'node:crypto'
import { fail, handleError, ok, readJson } from '@/lib/api'
import { getActor } from '@/lib/community/actor'
import { isConfigured } from '@/lib/env'
import { presignPut } from '@/lib/r2'
import {
  artifactAccepts,
  artifactExtension,
  isFetchableUrl,
  resolveLinkTitle,
  safeDomain,
} from '@/lib/community/artifacts'
import type { ArtifactType } from '@/lib/types'

interface Body {
  type?: string
  title?: string | null
  caption?: string | null
  capturedAt?: string | null
  // uploaded types
  filename?: string
  contentType?: string
  size?: number
  // link type
  url?: string
}

const TYPES: ArtifactType[] = ['flyer', 'image_doc', 'pdf', 'audio', 'link']
const MAX_BYTES = 500 * 1024 ** 2 // 500MB — plenty for a PDF or a voice memo

/** Add an artifact to an event. Uploaded types get a presigned R2 PUT; links get
 *  their title resolved (best-effort) and stored. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor()
    if (!actor) return fail('Not signed in.', 401)

    const { id: eventId } = await params
    const body = await readJson<Body>(request)
    const type = TYPES.find((t) => t === body.type)
    if (!type) return fail('Pick what kind of thing this is.')

    const title = (body.title ?? '').trim().slice(0, 200) || null
    const caption = (body.caption ?? '').trim().slice(0, 2000) || null
    const capturedAt = normalizeTimestamp(body.capturedAt)
    const base = {
      event_id: eventId,
      type,
      title,
      caption,
      captured_at: capturedAt,
      created_by_member: actor.memberId,
      created_by: actor.userId,
    }

    if (type === 'link') {
      const url = (body.url ?? '').trim()
      if (!isFetchableUrl(url)) return fail('That doesn’t look like a web link.')
      const resolved = title ?? (await resolveLinkTitle(url)) ?? safeDomain(url)
      const { data, error } = await actor.db
        .from('event_artifacts')
        .insert({ ...base, url, title: resolved })
        .select('id')
        .single()
      if (error || !data) return fail(`Could not add that link: ${error?.message ?? 'unknown'}`, 500)
      return ok({ id: data.id })
    }

    // Uploaded types.
    if (!isConfigured('r2')) return fail('File storage isn’t set up yet.', 503)
    const contentType = (body.contentType ?? '').toLowerCase()
    if (!artifactAccepts(type, contentType)) {
      return fail('That file type isn’t supported here. Use a JPG, PNG, HEIC, WebP, PDF, M4A, MP3, or WAV.')
    }
    const size = Number(body.size)
    if (!Number.isFinite(size) || size <= 0) return fail('That file looks empty.')
    if (size > MAX_BYTES) return fail('That file is larger than 500MB.')

    const artifactId = randomUUID()
    const storageKey = `artifacts/${eventId}/${artifactId}.${artifactExtension(contentType)}`

    const { data, error } = await actor.db
      .from('event_artifacts')
      .insert({ ...base, storage_key: storageKey })
      .select('id')
      .single()
    if (error || !data) return fail(`Could not add that: ${error?.message ?? 'unknown'}`, 500)

    const put = await presignPut(storageKey, contentType)
    return ok({ id: data.id, put })
  } catch (error) {
    return handleError(error, 'community/artifacts')
  }
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00Z` : trimmed
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
