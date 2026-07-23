'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CROP } from '@/lib/client/media-prep'
import { clamp, cropGeometry, drawCrop } from '@/lib/client/crop-geometry'
import type { CropAspect, CropMetadata } from '@/lib/types'

const ASPECTS: { value: CropAspect; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'original', label: 'Original' },
  { value: '1:1', label: 'Square' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
]

function ratio(aspect: CropAspect): number | undefined {
  if (aspect === '1:1') return 1
  if (aspect === '4:3') return 4 / 3
  if (aspect === '3:2') return 3 / 2
  if (aspect === '16:9') return 16 / 9
  if (aspect === '9:16') return 9 / 16
  return undefined
}

export function PhotoCropEditor({
  src,
  filename,
  initial,
  error,
  onCancel,
  onSave,
}: {
  src: string
  filename: string
  initial?: CropMetadata | null
  error?: string | null
  onCancel: () => void
  onSave: (crop: CropMetadata) => void | Promise<void>
}) {
  const [crop, setCrop] = useState<CropMetadata>(initial ?? DEFAULT_CROP)
  const [saving, setSaving] = useState(false)
  const [naturalRatio, setNaturalRatio] = useState(4 / 3)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const previewRatio =
    ratio(crop.aspect) ??
    crop.freeAspect ??
    (crop.rotation === 90 || crop.rotation === 270 ? 1 / naturalRatio : naturalRatio)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    let live = true
    const next = new Image()
    next.decoding = 'async'
    next.onload = () => {
      if (!live) return
      setNaturalRatio(next.naturalWidth / next.naturalHeight)
      setImage(next)
      setPreviewError(null)
    }
    next.onerror = () => {
      if (live) setPreviewError('This browser could not preview that photo.')
    }
    next.src = src
    return () => {
      live = false
      next.src = ''
    }
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const context = canvas.getContext('2d')
    if (!context) return

    const geometry = cropGeometry(image.naturalWidth, image.naturalHeight, crop)
    const ratio = geometry.width / geometry.height
    const max = 960
    canvas.width = ratio >= 1 ? max : Math.max(1, Math.round(max * ratio))
    canvas.height = ratio >= 1 ? Math.max(1, Math.round(max / ratio)) : max
    drawCrop(
      context,
      image,
      image.naturalWidth,
      image.naturalHeight,
      crop,
      canvas.width,
      canvas.height,
    )
  }, [crop, image])

  function rotate() {
    setCrop((current) => ({
      ...current,
      rotation: ((current.rotation + 90) % 360) as CropMetadata['rotation'],
    }))
  }

  return (
    <div className="fixed inset-0 z-[90] grid bg-black/90 p-4 backdrop-blur-sm sm:place-items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Crop ${filename}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
          }
          if (event.key === 'Tab') {
            event.stopPropagation()
            trapFocus(event, event.currentTarget)
          }
        }}
        className="flex min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-edge bg-ink-raised sm:max-h-[90vh]"
      >
        <header className="flex items-center justify-between border-b border-edge px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="font-semibold">Crop photo</h2>
            <p className="truncate text-xs text-paper-faint">{filename}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="text-sm text-paper-dim hover:text-paper"
          >
            Cancel
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:grid-cols-[minmax(0,1fr)_15rem] sm:p-5">
          <div className="grid min-h-[18rem] place-items-center overflow-hidden rounded-lg bg-black p-4">
            <div className="relative grid max-h-full w-fit max-w-full place-items-center overflow-hidden bg-ink-high">
              <canvas
                ref={canvasRef}
                aria-label="Crop preview. Drag to reposition, pinch or scroll to zoom."
                className="max-h-[65vh] max-w-full touch-none select-none"
                style={{ aspectRatio: String(previewRatio) }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
                  if (pointers.current.size === 2) {
                    const [a, b] = [...pointers.current.values()]
                    pinch.current = { distance: distance(a, b), zoom: crop.zoom }
                  }
                }}
                onPointerMove={(event) => {
                  const previous = pointers.current.get(event.pointerId)
                  if (!previous) return
                  pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
                  const points = [...pointers.current.values()]
                  if (points.length >= 2 && pinch.current) {
                    const ratio =
                      distance(points[0], points[1]) / Math.max(1, pinch.current.distance)
                    setCrop((current) => ({
                      ...current,
                      zoom: clamp(pinch.current!.zoom * ratio, 1, 3),
                    }))
                    return
                  }
                  if (points.length === 1) {
                    const width = Math.max(1, event.currentTarget.clientWidth)
                    const height = Math.max(1, event.currentTarget.clientHeight)
                    setCrop((current) => ({
                      ...current,
                      x: clamp(current.x - ((event.clientX - previous.x) / width) * 2, -1, 1),
                      y: clamp(current.y - ((event.clientY - previous.y) / height) * 2, -1, 1),
                    }))
                  }
                }}
                onPointerUp={(event) => {
                  pointers.current.delete(event.pointerId)
                  pinch.current = null
                }}
                onPointerCancel={(event) => {
                  pointers.current.delete(event.pointerId)
                  pinch.current = null
                }}
                onWheel={(event) => {
                  event.preventDefault()
                  setCrop((current) => ({
                    ...current,
                    zoom: clamp(current.zoom + (event.deltaY > 0 ? -0.1 : 0.1), 1, 3),
                  }))
                }}
              />
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className="border-[0.5px] border-white/30" />
                ))}
              </div>
              {previewError && (
                <p
                  role="alert"
                  className="absolute inset-x-4 bottom-4 text-center text-xs text-paper-soft"
                >
                  {previewError}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-xs text-paper-faint">Aspect ratio</legend>
              <div className="flex flex-wrap gap-2">
                {ASPECTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCrop((current) => ({ ...current, aspect: option.value }))}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${
                      crop.aspect === option.value
                        ? 'border-white bg-white text-black'
                        : 'border-edge-strong text-paper-dim hover:text-paper'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <Range
              label="Zoom"
              min={1}
              max={3}
              step={0.05}
              value={crop.zoom}
              onChange={(zoom) => setCrop((current) => ({ ...current, zoom }))}
            />
            {crop.aspect === 'free' && (
              <Range
                label="Free ratio"
                min={0.4}
                max={2.5}
                step={0.01}
                value={crop.freeAspect ?? previewRatio}
                onChange={(freeAspect) => setCrop((current) => ({ ...current, freeAspect }))}
              />
            )}
            <Range
              label="Horizontal"
              min={-1}
              max={1}
              step={0.02}
              value={crop.x}
              onChange={(x) => setCrop((current) => ({ ...current, x }))}
            />
            <Range
              label="Vertical"
              min={-1}
              max={1}
              step={0.02}
              value={crop.y}
              onChange={(y) => setCrop((current) => ({ ...current, y }))}
            />

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={rotate} className="btn btn-ghost flex-1 px-3 text-sm">
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => setCrop(DEFAULT_CROP)}
                className="btn btn-ghost flex-1 px-3 text-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-edge px-4 py-3 sm:px-5">
          {error && (
            <p role="alert" className="mr-auto self-center text-xs text-paper-soft">
              {error}
            </p>
          )}
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true)
              void Promise.resolve(onSave(crop)).finally(() => setSaving(false))
            }}
            className="btn btn-primary"
          >
            {saving ? 'Saving…' : 'Save crop'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function Range({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-xs text-paper-faint">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-white"
      />
    </label>
  )
}

function trapFocus(event: React.KeyboardEvent<HTMLElement>, container: HTMLElement) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
