'use client'

/**
 * Getting a phone's file ready to upload.
 *
 * Three jobs, all in the browser so nothing large crosses our server:
 *   1. Decode anything an iPhone can produce (including HEIC).
 *   2. Derive a web-safe display copy and a small thumbnail.
 *   3. Recover the real capture date from EXIF, so "4 years ago today" means
 *      the day it was taken, not the day it was copied off the phone.
 */

const VIDEO_EXTENSIONS = /\.(mov|mp4|m4v|avi|mkv|webm|3gp|3g2|mts|m2ts|mpg|mpeg|wmv|flv|qt)$/i
const HEIC_EXTENSIONS = /\.(heic|heif)$/i

export type Kind = 'photo' | 'video'

export function classify(file: File): Kind {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('image/')) return 'photo'
  // Old camcorder files and some Android exports arrive with an empty MIME type.
  return VIDEO_EXTENSIONS.test(file.name) ? 'video' : 'photo'
}

export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || HEIC_EXTENSIONS.test(file.name)
}

/**
 * Decodes to a bitmap.
 *
 * iOS Safari can decode HEIC natively because the OS owns the codec — which is
 * the common case, since HEIC comes off iPhones and usually gets uploaded from
 * one. Only when that fails do we pull in the (heavy) JS decoder.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (nativeError) {
    if (!isHeic(file)) throw nativeError
    const { default: heic2any } = await import('heic2any')
    const converted = (await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    })) as Blob | Blob[]
    const blob = Array.isArray(converted) ? converted[0] : converted
    return createImageBitmap(blob, { imageOrientation: 'from-image' })
  }
}

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser would not give us a canvas to work with.')
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    // WebP is meaningfully smaller; Safari < 14 falls back to JPEG on its own
    // because toBlob ignores a type it can't encode.
    canvas.toBlob(resolve, 'image/webp', quality)
  })

  if (blob && blob.type === 'image/webp') return { blob, width, height }

  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  if (!jpeg) throw new Error('Could not prepare this photo for the web.')
  return { blob: jpeg, width, height }
}

export interface PreparedPhoto {
  display: Blob
  thumb: Blob
  width: number
  height: number
  takenAt: Date
  previewUrl: string
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await decode(file)
  try {
    const [display, thumb] = await Promise.all([
      encode(bitmap, 2560, 0.86),
      encode(bitmap, 640, 0.72),
    ])
    return {
      display: display.blob,
      thumb: thumb.blob,
      width: bitmap.width,
      height: bitmap.height,
      takenAt: (await exifTakenAt(file)) ?? new Date(file.lastModified),
      previewUrl: URL.createObjectURL(thumb.blob),
    }
  } finally {
    bitmap.close()
  }
}

// ---------------------------------------------------------------------------
// EXIF
// ---------------------------------------------------------------------------

/**
 * Pulls DateTimeOriginal (tag 0x9003) out of a JPEG's APP1 segment.
 *
 * Deliberately tiny: we want one field, and an EXIF library is ~50KB to get it.
 * Anything unexpected returns null and we fall back to the file's mtime.
 */
export async function exifTakenAt(file: File): Promise<Date | null> {
  if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return null

  try {
    // The EXIF block lives at the front; 256KB is far more than enough.
    const head = await file.slice(0, 262_144).arrayBuffer()
    const view = new DataView(head)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null // not a JPEG

    let offset = 2
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) return null
      const marker = view.getUint8(offset + 1)
      const size = view.getUint16(offset + 2)

      if (marker === 0xe1) {
        const app1 = offset + 4
        if (view.getUint32(app1) !== 0x45786966) return null // "Exif"
        const tiff = app1 + 6
        const little = view.getUint16(tiff) === 0x4949
        const ifd0 = tiff + view.getUint32(tiff + 4, little)

        const readIfd = (start: number): number | null => {
          if (start + 2 > view.byteLength) return null
          const count = view.getUint16(start, little)
          for (let i = 0; i < count; i += 1) {
            const entry = start + 2 + i * 12
            if (entry + 12 > view.byteLength) return null
            const tag = view.getUint16(entry, little)
            // 0x8769 = pointer to the EXIF sub-IFD, where the date actually lives.
            if (tag === 0x8769) {
              const sub = tiff + view.getUint32(entry + 8, little)
              const nested = readIfd(sub)
              if (nested != null) return nested
            }
            if (tag === 0x9003 || tag === 0x9004) {
              return tiff + view.getUint32(entry + 8, little)
            }
          }
          return null
        }

        const at = readIfd(ifd0)
        if (at == null || at + 19 > view.byteLength) return null

        // Format is "YYYY:MM:DD HH:MM:SS", in the camera's local time.
        let text = ''
        for (let i = 0; i < 19; i += 1) text += String.fromCharCode(view.getUint8(at + i))
        const m = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
        if (!m) return null

        const date = new Date(
          Number(m[1]), Number(m[2]) - 1, Number(m[3]),
          Number(m[4]), Number(m[5]), Number(m[6]),
        )
        return Number.isNaN(date.getTime()) ? null : date
      }

      if (marker === 0xda) return null // start of scan — no EXIF present
      offset += 2 + size
    }
    return null
  } catch {
    return null
  }
}
