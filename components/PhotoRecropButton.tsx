'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhotoCropEditor } from '@/components/PhotoCropEditor'
import { createBrowserPhotoPreview, preparePhotoBlob } from '@/lib/client/media-prep'
import type { CropMetadata } from '@/lib/types'

export function PhotoRecropButton({
  mediaId,
  originalUrl,
  filename,
  mimeType,
  initial,
}: {
  mediaId: string
  originalUrl: string
  filename: string
  mimeType?: string | null
  initial?: CropMetadata | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editorSrc, setEditorSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openEditor() {
    setError(null)
    setLoading(true)
    try {
      const response = await fetch(originalUrl)
      if (!response.ok) throw new Error('Could not load the original photo.')
      const blob = await response.blob()
      const file = new File([blob], filename, {
        type: blob.type || mimeType || 'application/octet-stream',
      })
      const preview = await createBrowserPhotoPreview(file)
      setEditorSrc(preview)
      setOpen(true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not preview that photo.')
    } finally {
      setLoading(false)
    }
  }

  function closeEditor() {
    setOpen(false)
    if (editorSrc) URL.revokeObjectURL(editorSrc)
    setEditorSrc(null)
  }

  async function save(crop: CropMetadata) {
    setError(null)
    // Unmount the full-resolution preview before decoding the original into a
    // bitmap. Keeping both decodes alive at once is unnecessary on large phone
    // photos and can create a sharp memory spike.
    closeEditor()
    setSaving(true)
    try {
      const original = await fetch(originalUrl)
      if (!original.ok) throw new Error('Could not load the original photo.')
      const originalBlob = await original.blob()
      const prepared = await preparePhotoBlob(
        new File([originalBlob], filename, {
          type: originalBlob.type || mimeType || 'application/octet-stream',
        }),
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
        if (!displayUpload.ok || !thumbUpload.ok)
          throw new Error('The cropped copies did not upload.')

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
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the crop.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openEditor()}
        disabled={saving || loading}
        className="rounded-full border border-edge px-3.5 py-2 text-sm text-paper-dim transition-colors hover:bg-ink-hover hover:text-paper disabled:opacity-50"
      >
        {saving ? 'Saving crop…' : loading ? 'Loading photo…' : 'Edit crop'}
      </button>
      {error && !open && (
        <p role="alert" className="mt-2 text-xs text-paper-soft">
          {error}
        </p>
      )}
      {open && editorSrc && (
        <PhotoCropEditor
          src={editorSrc}
          filename={filename}
          initial={initial}
          error={error}
          onCancel={closeEditor}
          onSave={save}
        />
      )}
    </>
  )
}
