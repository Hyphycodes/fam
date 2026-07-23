import type { CropMetadata } from '@/lib/types'

export interface CropGeometry {
  crop: CropMetadata
  rotatedWidth: number
  rotatedHeight: number
  x: number
  y: number
  width: number
  height: number
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeCrop(crop?: CropMetadata | null): CropMetadata {
  const rotation = crop?.rotation ?? 0
  return {
    aspect: crop?.aspect ?? 'free',
    freeAspect:
      crop?.freeAspect && Number.isFinite(crop.freeAspect)
        ? clamp(crop.freeAspect, 0.4, 2.5)
        : undefined,
    zoom: clamp(crop?.zoom ?? 1, 1, 3),
    x: clamp(crop?.x ?? 0, -1, 1),
    y: clamp(crop?.y ?? 0, -1, 1),
    rotation: rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0,
  }
}

function aspectValue(crop: CropMetadata, width: number, height: number): number {
  if (crop.aspect === '1:1') return 1
  if (crop.aspect === '4:3') return 4 / 3
  if (crop.aspect === '3:2') return 3 / 2
  if (crop.aspect === '16:9') return 16 / 9
  if (crop.aspect === '9:16') return 9 / 16
  if (crop.aspect === 'free' && crop.freeAspect && Number.isFinite(crop.freeAspect)) {
    return clamp(crop.freeAspect, 0.4, 2.5)
  }
  return width / height
}

export function cropGeometry(
  sourceWidth: number,
  sourceHeight: number,
  cropInput?: CropMetadata | null,
): CropGeometry {
  const crop = normalizeCrop(cropInput)
  const quarterTurn = crop.rotation === 90 || crop.rotation === 270
  const rotatedWidth = quarterTurn ? sourceHeight : sourceWidth
  const rotatedHeight = quarterTurn ? sourceWidth : sourceHeight
  const targetAspect = aspectValue(crop, rotatedWidth, rotatedHeight)

  let width = rotatedWidth
  let height = rotatedHeight
  if (rotatedWidth / rotatedHeight > targetAspect) width = rotatedHeight * targetAspect
  else height = rotatedWidth / targetAspect
  width /= crop.zoom
  height /= crop.zoom

  const travelX = Math.max(0, rotatedWidth - width)
  const travelY = Math.max(0, rotatedHeight - height)

  return {
    crop,
    rotatedWidth,
    rotatedHeight,
    x: travelX * ((crop.x + 1) / 2),
    y: travelY * ((crop.y + 1) / 2),
    width,
    height,
  }
}

/**
 * Draw the selected rectangle directly into the output canvas. Rotated photos
 * never need a second full-resolution backing canvas, which is important for
 * 48 MP phone images.
 */
export function drawCrop(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  cropInput: CropMetadata | null | undefined,
  outputWidth: number,
  outputHeight: number,
) {
  const geometry = cropGeometry(sourceWidth, sourceHeight, cropInput)
  const scaleX = outputWidth / geometry.width
  const scaleY = outputHeight / geometry.height

  context.save()
  context.clearRect(0, 0, outputWidth, outputHeight)
  context.setTransform(scaleX, 0, 0, scaleY, -geometry.x * scaleX, -geometry.y * scaleY)
  context.translate(geometry.rotatedWidth / 2, geometry.rotatedHeight / 2)
  context.rotate((geometry.crop.rotation * Math.PI) / 180)
  context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2)
  context.restore()
}
