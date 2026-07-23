'use client'

/**
 * Focal point from face detection, computed in the browser at ingest where the
 * decoded bitmap already lives.
 *
 * Uses the platform Shape Detection API (`FaceDetector`) when the browser offers
 * it — no model download, no dependency. It isn't everywhere, so its absence, no
 * face, or any error all resolve to a centered default. In a family archive the
 * subject is essentially always a face, which makes a face centroid far more
 * reliable than generic saliency; a wrong crop is never an outage, so best-effort
 * is exactly right here.
 */

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number }
}
interface FaceDetectorLike {
  detect(source: ImageBitmap): Promise<DetectedFace[]>
}
type FaceDetectorCtor = new (options?: {
  fastMode?: boolean
  maxDetectedFaces?: number
}) => FaceDetectorLike

export interface Focal {
  x: number
  y: number
  source: 'default' | 'face'
}

export const CENTER_FOCAL: Focal = { x: 0.5, y: 0.5, source: 'default' }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * The centroid of every detected face box, normalized to 0..1 and biased upward
 * ~10% so faces don't end up pinned under a bottom scrim.
 */
export async function detectFocal(bitmap: ImageBitmap): Promise<Focal> {
  try {
    const Ctor = (globalThis as { FaceDetector?: FaceDetectorCtor }).FaceDetector
    if (!Ctor || !bitmap.width || !bitmap.height) return CENTER_FOCAL

    const faces = await new Ctor({ fastMode: true, maxDetectedFaces: 8 }).detect(bitmap)
    if (!faces.length) return CENTER_FOCAL

    let sumX = 0
    let sumY = 0
    for (const face of faces) {
      sumX += face.boundingBox.x + face.boundingBox.width / 2
      sumY += face.boundingBox.y + face.boundingBox.height / 2
    }
    return {
      x: clamp01(sumX / faces.length / bitmap.width),
      y: clamp01(sumY / faces.length / bitmap.height - 0.1),
      source: 'face',
    }
  } catch {
    return CENTER_FOCAL
  }
}
