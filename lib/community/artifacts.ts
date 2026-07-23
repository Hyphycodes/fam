import 'server-only'

import type { DB } from '@/lib/api'
import { presignGet } from '@/lib/r2'
import { isConfigured } from '@/lib/env'
import type { ArtifactType, ArtifactView } from '@/lib/types'

/** The five artifact types, and what MIME each accepts on upload. */
export const ARTIFACT_MIME: Record<Exclude<ArtifactType, 'link'>, readonly string[]> = {
  flyer: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  image_doc: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  pdf: ['application/pdf'],
  audio: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'],
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

export function artifactExtension(contentType: string): string {
  return EXT[contentType.toLowerCase()] ?? 'bin'
}

/** True if `contentType` is allowed for the given uploaded artifact type. */
export function artifactAccepts(type: ArtifactType, contentType: string): boolean {
  if (type === 'link') return false
  return ARTIFACT_MIME[type].includes(contentType.toLowerCase())
}

export function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export async function getArtifacts(db: DB, eventId: string): Promise<ArtifactView[]> {
  const { data } = await db
    .from('event_artifacts')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const rows = (data ?? []) as {
    id: string
    event_id: string
    type: ArtifactType
    storage_key: string | null
    url: string | null
    title: string | null
    caption: string | null
    captured_at: string | null
  }[]
  const r2 = isConfigured('r2')

  return Promise.all(
    rows.map(async (row): Promise<ArtifactView> => {
      let href = row.url
      if (!href && row.storage_key && r2) href = await presignGet(row.storage_key)
      return {
        id: row.id,
        event_id: row.event_id,
        type: row.type,
        title: row.title,
        caption: row.caption,
        captured_at: row.captured_at,
        href,
        domain: row.url ? safeDomain(row.url) : null,
      }
    }),
  )
}

/** Reject obviously-internal targets before a server-side link fetch (basic SSRF guard). */
export function isFetchableUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Best-effort title for a pasted link, from Open Graph then <title>. Never
 * throws and never blocks for long: a broken card in a family archive is worse
 * than one someone typed by hand, so a failure here just falls through to the
 * manual-entry path in the UI.
 */
export async function resolveLinkTitle(url: string): Promise<string | null> {
  if (!isFetchableUrl(url)) return null
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ReelBot/1.0; +family-archive)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const html = (await response.text()).slice(0, 200_000)
    const og =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
    const title = og ?? html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]
    return title ? decodeEntities(title.trim()).slice(0, 200) : null
  } catch {
    return null
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}
