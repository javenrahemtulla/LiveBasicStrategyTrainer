/**
 * Card detection wrapper — uses pure computer vision (no ML).
 *
 * Wraps the cardVision pipeline and provides the detection interface
 * used by the rest of the app.
 */

import { Detection } from './types'
import { detectCardsInFrame } from './cardVision'

export const DETECT_FPS = 3 // Detection rate in frames per second

/**
 * Detect cards in a camera frame using pure computer vision.
 * No API keys, no models, no ML — just image processing.
 */
export function detectCards(imageData: ImageData): Detection[] {
  return detectCardsInFrame(imageData)
}

/**
 * Non-maximum suppression for overlapping detections.
 */
export function nms(detections: Detection[], iouThreshold: number): Detection[] {
  if (detections.length === 0) return []

  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence)
  const keep: Detection[] = []

  while (sorted.length > 0) {
    const best = sorted.shift()!
    keep.push(best)

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(best.bbox, sorted[i].bbox) > iouThreshold) {
        sorted.splice(i, 1)
      }
    }
  }

  return keep
}

function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b

  const x1 = Math.max(ax, bx)
  const y1 = Math.max(ay, by)
  const x2 = Math.min(ax + aw, bx + bw)
  const y2 = Math.min(ay + ah, by + bh)

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = aw * ah + bw * bh - intersection

  return union > 0 ? intersection / union : 0
}
