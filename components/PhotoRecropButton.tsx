'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhotoCropEditor } from '@/components/PhotoCropEditor'
import { preparePhotoBlob } from '@/lib/client/media-prep'
import type { CropMetadata } from '@/lib/types'

export function PhotoRecropButton({
  mediaId,
  sourceUrl,
  originalUrl,
  filename,
  mimeType,
  initial,
}: {
  mediaId: string
  sourceUrl: string
  originalUrl: string
  filename: string
  mimeType?: string | null
  initial?: CropMetadata | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(crop: CropMetadata) {
    setError(null)
    try {
      const original = await fetch(originalUrl)
      if (!original.ok) throw new Error('Could not load the original photo.')
      const originalBlob = await original.blob()
      const prepared = await preparePhotoBlob(
        new File([originalBlob], filename, { type: originalBlob.type || mimeType || 'application/octet-stream' }),
        crop,
      )
      try {
        const prepareResponse = await fetch(`/api/media/${mediaId}/crop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'prepare',
            displayType: prepared.display.type,
            thumbType: prepared.thumb.type,
          }),
        })
        const payload = await prepareResponse.json().catch(() => ({}))
        if (!prepareResponse.ok) throw new Error(payload.error || 'Could not prepare the crop.')

        const [displayUpload, thumbUpload] = await Promise.all([
          fetch(payload.put.display, {
            method: 'PUT',
            body: prepared.display,
            headers: { 'Content-Type': prepared.display.type },
          }),
          fetch(payload.put.thumb, {
            method: 'PUT',
            body: prepared.thumb,
            headers: { 'Content-Type': prepared.thumb.type },
          }),
        ])
        if (!displayUpload.ok || !thumbUpload.ok) throw new Error('The cropped copies did not upload.')

        const completeResponse = await fetch(`/api/media/${mediaId}/crop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            crop,
            width: prepared.width,
            height: prepared.height,
          }),
        })
        const complete = await completeResponse.json().catch(() => ({}))
        if (!completeResponse.ok) throw new Error(complete.error || 'Could not save the crop.')
      } finally {
        URL.revokeObjectURL(prepared.previewUrl)
      }
      setOpen(false)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the crop.')
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-edge px-3.5 py-2 text-sm text-paper-dim transition-colors hover:bg-ink-hover hover:text-paper">
        Edit crop
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-paper-soft">{error}</p>}
      {open && (
        <PhotoCropEditor
          src={sourceUrl}
          filename={filename}
          initial={initial}
          error={error}
          onCancel={() => setOpen(false)}
          onSave={save}
        />
      )}
    </>
  )
}
