'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { preparePhoto } from '@/lib/client/media-prep'
import { formatCapturedAt } from '@/lib/format'
import type { ArtifactType, ArtifactView } from '@/lib/types'

/**
 * Event artifacts — the flyer, the menu, the screenshot, the voice memo, the
 * link. Each type renders with intent, never as a download chip. On a planned
 * event these are the primary content (there's no album yet); on a completed one
 * they're a distinct section beside the media.
 */
export function Artifacts({
  eventId,
  artifacts,
  canEdit,
  planned,
}: {
  eventId: string
  artifacts: ArtifactView[]
  canEdit: boolean
  planned: boolean
}) {
  const [zoom, setZoom] = useState<ArtifactView | null>(null)

  const flyers = artifacts.filter((a) => a.type === 'flyer')
  const rest = artifacts.filter((a) => a.type !== 'flyer')

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          {planned ? 'The plan' : 'Artifacts'}
          {artifacts.length > 0 && (
            <span className="ml-2 text-sm font-normal text-paper-faint">{artifacts.length}</span>
          )}
        </h2>
      </div>

      {flyers.map((artifact) => (
        <FlyerArtifact key={artifact.id} artifact={artifact} canEdit={canEdit} onZoom={setZoom} />
      ))}

      {rest.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rest.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} canEdit={canEdit} onZoom={setZoom} />
          ))}
        </div>
      )}

      {artifacts.length === 0 && !canEdit && (
        <p className="rounded-xl border border-dashed border-edge px-5 py-8 text-center text-sm text-paper-faint">
          Nothing attached yet.
        </p>
      )}

      {canEdit && <ArtifactComposer eventId={eventId} />}

      {zoom?.href && <ZoomOverlay artifact={zoom} onClose={() => setZoom(null)} />}
    </section>
  )
}

function ArtifactCard({
  artifact,
  canEdit,
  onZoom,
}: {
  artifact: ArtifactView
  canEdit: boolean
  onZoom: (a: ArtifactView) => void
}) {
  if (artifact.type === 'image_doc') return <ImageDocArtifact artifact={artifact} canEdit={canEdit} onZoom={onZoom} />
  if (artifact.type === 'pdf') return <PdfArtifact artifact={artifact} canEdit={canEdit} />
  if (artifact.type === 'audio') return <AudioArtifact artifact={artifact} canEdit={canEdit} />
  if (artifact.type === 'link') return <LinkArtifact artifact={artifact} canEdit={canEdit} />
  return null
}

function Frame({
  children,
  artifact,
  canEdit,
  className = '',
}: {
  children: React.ReactNode
  artifact: ArtifactView
  canEdit: boolean
  className?: string
}) {
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-edge bg-ink-raised ${className}`}>
      {children}
      {canEdit && <DeleteButton id={artifact.id} />}
    </div>
  )
}

function FlyerArtifact({
  artifact,
  canEdit,
  onZoom,
}: {
  artifact: ArtifactView
  canEdit: boolean
  onZoom: (a: ArtifactView) => void
}) {
  return (
    <Frame artifact={artifact} canEdit={canEdit} className="mt-4">
      <button type="button" onClick={() => onZoom(artifact)} className="block w-full" aria-label="Zoom flyer">
        {artifact.href && <img src={artifact.href} alt={artifact.title ?? ''} className="max-h-[70vh] w-full object-contain" />}
      </button>
      <Caption artifact={artifact} />
    </Frame>
  )
}

function ImageDocArtifact({
  artifact,
  canEdit,
  onZoom,
}: {
  artifact: ArtifactView
  canEdit: boolean
  onZoom: (a: ArtifactView) => void
}) {
  return (
    <Frame artifact={artifact} canEdit={canEdit}>
      <button type="button" onClick={() => onZoom(artifact)} className="block aspect-[4/3] w-full bg-ink-high" aria-label="Zoom">
        {artifact.href && <img src={artifact.href} alt={artifact.title ?? ''} loading="lazy" className="h-full w-full object-cover" />}
      </button>
      <Caption artifact={artifact} />
    </Frame>
  )
}

function PdfArtifact({ artifact, canEdit }: { artifact: ArtifactView; canEdit: boolean }) {
  return (
    <Frame artifact={artifact} canEdit={canEdit}>
      <div className="aspect-[4/3] w-full bg-white">
        {artifact.href && (
          <object data={`${artifact.href}#toolbar=0&view=FitH`} type="application/pdf" className="h-full w-full">
            <div className="grid h-full place-items-center bg-ink-high text-sm text-paper-faint">
              PDF preview unavailable
            </div>
          </object>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="min-w-0 flex-1 truncate text-sm text-paper-soft">
          <span aria-hidden="true">📄 </span>
          {artifact.title ?? 'Document'}
        </span>
        {artifact.href && (
          <a
            href={artifact.href}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Open
          </a>
        )}
      </div>
    </Frame>
  )
}

function AudioArtifact({ artifact, canEdit }: { artifact: ArtifactView; canEdit: boolean }) {
  return (
    <Frame artifact={artifact} canEdit={canEdit}>
      <div className="p-4">
        <p className="mb-2 truncate text-sm font-medium text-paper">
          <span aria-hidden="true">🎧 </span>
          {artifact.title ?? 'Audio'}
        </p>
        {artifact.href && <audio controls preload="none" src={artifact.href} className="w-full" />}
        {artifact.caption && <p className="mt-2 text-xs text-paper-faint">{artifact.caption}</p>}
      </div>
    </Frame>
  )
}

function LinkArtifact({ artifact, canEdit }: { artifact: ArtifactView; canEdit: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <Frame artifact={artifact} canEdit={canEdit}>
      <a href={artifact.href ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 transition-colors hover:bg-ink-hover">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink-high">
          {artifact.domain && !broken ? (
            <img src={`https://${artifact.domain}/favicon.ico`} alt="" className="size-5" onError={() => setBroken(true)} />
          ) : (
            <span aria-hidden="true">🔗</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-paper">{artifact.title ?? artifact.domain ?? 'Link'}</span>
          {artifact.domain && <span className="meta-mono block truncate text-paper-faint">{artifact.domain}</span>}
        </span>
      </a>
    </Frame>
  )
}

function Caption({ artifact }: { artifact: ArtifactView }) {
  if (!artifact.title && !artifact.caption && !artifact.captured_at) return null
  return (
    <div className="p-3">
      {artifact.title && <p className="truncate text-sm font-medium text-paper">{artifact.title}</p>}
      {artifact.caption && <p className="mt-0.5 text-sm text-paper-soft">{artifact.caption}</p>}
      {artifact.captured_at && (
        <p className="meta-mono mt-1 text-paper-faint">{formatCapturedAt(artifact.captured_at, 'day')}</p>
      )}
    </div>
  )
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (busy || !confirm('Remove this artifact?')) return
    setBusy(true)
    try {
      const response = await fetch(`/api/community/artifacts/${id}`, { method: 'DELETE' })
      if (response.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void remove()}
      aria-label="Remove artifact"
      className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-full bg-black/55 text-white/90 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100"
    >
      ✕
    </button>
  )
}

function ZoomOverlay({ artifact, onClose }: { artifact: ArtifactView; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4"
      onClick={onClose}
    >
      <img src={artifact.href ?? ''} alt={artifact.title ?? ''} className="max-h-[92vh] max-w-full object-contain" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white"
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<ArtifactType, string> = {
  flyer: 'Flyer',
  image_doc: 'Image / doc',
  pdf: 'PDF',
  audio: 'Audio',
  link: 'Link',
}
const IMAGE_KINDS: ArtifactType[] = ['flyer', 'image_doc']

function guessMime(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      heic: 'image/heic',
      heif: 'image/heic',
      webp: 'image/webp',
      pdf: 'application/pdf',
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
    }[ext ?? ''] ?? ''
  )
}

function ArtifactComposer({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ArtifactType>('image_doc')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const isLink = kind === 'link'

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (isLink) {
        if (!url.trim()) throw new Error('Paste a link first.')
        const response = await fetch(`/api/community/events/${eventId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'link', url: url.trim(), title: title || null, caption: caption || null }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Could not add that link.')
      } else {
        if (!file) throw new Error('Choose a file first.')
        // Images become a web-safe derivative so HEIC and huge originals render
        // everywhere. PDFs and audio upload as-is.
        let blob: Blob = file
        let contentType = file.type || guessMime(file.name)
        let capturedAt: string | null = null
        if (IMAGE_KINDS.includes(kind)) {
          const prepared = await preparePhoto(file)
          blob = prepared.display
          contentType = prepared.display.type
          if (prepared.takenSource === 'exif') capturedAt = prepared.takenAt.toISOString()
        }
        const response = await fetch(`/api/community/events/${eventId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: kind,
            filename: file.name,
            contentType,
            size: blob.size,
            title: title || null,
            caption: caption || null,
            capturedAt,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Could not add that.')
        const put = await fetch(data.put, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
        if (!put.ok) {
          await fetch(`/api/community/artifacts/${data.id}`, { method: 'DELETE' })
          throw new Error('The file did not upload. Try again.')
        }
      }
      setOpen(false)
      setFile(null)
      setUrl('')
      setTitle('')
      setCaption('')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost mt-4">
        <span className="text-lg leading-none">+</span> Add an artifact
      </button>
    )
  }

  return (
    <div className="settings-panel animate-rise mt-4 space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Artifact type">
        {(Object.keys(KIND_LABEL) as ArtifactType[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              kind === value ? 'border-white/70 bg-white/10 text-paper' : 'border-edge text-paper-dim hover:bg-ink-hover'
            }`}
          >
            {KIND_LABEL[value]}
          </button>
        ))}
      </div>

      {isLink ? (
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          inputMode="url"
          className="field"
          aria-label="Link URL"
        />
      ) : (
        <>
          <button type="button" onClick={() => fileInput.current?.click()} className="tile block aspect-[16/9] w-full">
            <span className="grid h-full w-full place-items-center bg-ink-high text-sm text-paper-faint">
              {file ? file.name : 'Choose a file'}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={
              kind === 'pdf'
                ? 'application/pdf'
                : kind === 'audio'
                  ? 'audio/*,.m4a,.mp3,.wav'
                  : 'image/*,.heic,.heif'
            }
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </>
      )}

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={isLink ? 'Title (optional — we’ll try to fetch it)' : 'Title (optional)'}
        className="field"
        aria-label="Title"
      />
      {!isLink && (
        <input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Caption (optional)"
          className="field"
          aria-label="Caption"
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-paper-soft">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn btn-primary">
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-paper-faint hover:text-paper">
          Cancel
        </button>
      </div>
    </div>
  )
}
