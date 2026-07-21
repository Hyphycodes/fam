'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/Avatar'

/**
 * A member's own profile: their picture and the name everyone sees. The photo
 * is downscaled to a small square in the browser before it ever leaves the
 * phone, so the upload is tiny and instant.
 */
export function ProfileEditor({
  displayName,
  avatarUrl,
}: {
  displayName: string
  avatarUrl: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [avatar, setAvatar] = useState(avatarUrl)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const square = await downscaleSquare(file, 512)
      const form = new FormData()
      form.append('file', square, 'avatar.jpg')
      const response = await fetch('/api/community/avatar', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Upload failed')
      setAvatar(data.avatar_url)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That photo did not upload.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === displayName) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch('/api/community/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Could not save')
      setSaved(true)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="group relative rounded-full"
          aria-label="Change your photo"
        >
          <Avatar name={name} src={avatar} size={80} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Change
          </span>
        </button>
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="btn btn-ghost"
          >
            {avatar ? 'Change photo' : 'Add a photo'}
          </button>
          <p className="mt-2 text-xs text-paper-faint">A square looks best.</p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={pickPhoto}
          className="sr-only"
        />
      </div>

      <form onSubmit={saveName} className="max-w-sm">
        <label className="mb-1.5 block text-xs text-paper-faint">Your name</label>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setSaved(false)
          }}
          className="field text-lg"
          aria-label="Your display name"
        />
        {name.trim() && name.trim() !== displayName && (
          <button type="submit" disabled={busy} className="btn btn-primary mt-3">
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
        {saved && <p className="mt-3 text-sm text-paper-dim">Saved.</p>}
      </form>

      {error && <p className="text-sm text-paper-soft">{error}</p>}
    </div>
  )
}

/** Center-crop to a square and shrink to `size`px — keeps uploads tiny. */
async function downscaleSquare(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))),
      'image/jpeg',
      0.85,
    ),
  )
}
