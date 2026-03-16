import { Detection, Card, Rank, Suit } from './types'

/**
 * Card detection pipeline using TensorFlow.js with a YOLOv8 model.
 *
 * The model detects 52 playing cards. Class labels are in format:
 * "2c", "2d", "2h", "2s", "3c", ..., "Ac", "Ad", "Ah", "As"
 *
 * For the web worker approach, this module handles:
 * 1. Loading the model
 * 2. Preprocessing camera frames
 * 3. Running inference
 * 4. Post-processing detections (NMS, confidence filtering)
 */

// Class labels for 52 cards (rank + suit)
const RANKS_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS_ORDER: Suit[] = ['c', 'd', 'h', 's']

export const CLASS_LABELS: string[] = []
for (const rank of RANKS_ORDER) {
  for (const suit of SUITS_ORDER) {
    CLASS_LABELS.push(`${rank}${suit}`)
  }
}

export function labelToCard(label: string): Card {
  const rank = label[0] as Rank
  const suit = label[1] as Suit
  return { rank, suit }
}

export interface DetectorConfig {
  modelUrl: string
  confidenceThreshold: number
  iouThreshold: number // for NMS
  targetFps: number
}

export const DEFAULT_CONFIG: DetectorConfig = {
  modelUrl: '/models/yolov8n-cards/model.json',
  confidenceThreshold: 0.7,
  iouThreshold: 0.5,
  targetFps: 5,
}

/**
 * Messages sent to/from the detection web worker.
 */
export type WorkerMessage =
  | { type: 'init'; config: DetectorConfig }
  | { type: 'detect'; imageData: ImageData; frameId: number }
  | { type: 'ready' }
  | { type: 'detections'; detections: Detection[]; frameId: number }
  | { type: 'error'; message: string }

/**
 * CardDetector manages the web worker lifecycle and provides
 * a clean API for the rest of the app.
 */
export class CardDetector {
  private worker: Worker | null = null
  private onDetections: ((detections: Detection[]) => void) | null = null
  private ready = false
  private config: DetectorConfig

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL('../workers/detector.worker.ts', import.meta.url),
          { type: 'module' }
        )

        this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const msg = event.data
          switch (msg.type) {
            case 'ready':
              this.ready = true
              resolve()
              break
            case 'detections':
              this.onDetections?.(msg.detections)
              break
            case 'error':
              console.error('Detector error:', msg.message)
              if (!this.ready) reject(new Error(msg.message))
              break
          }
        }

        this.worker.postMessage({ type: 'init', config: this.config })
      } catch (err) {
        reject(err)
      }
    })
  }

  detect(imageData: ImageData, frameId: number = 0) {
    if (!this.worker || !this.ready) return
    this.worker.postMessage({ type: 'detect', imageData, frameId }, [imageData.data.buffer])
  }

  setCallback(callback: (detections: Detection[]) => void) {
    this.onDetections = callback
  }

  destroy() {
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }
}

/**
 * Non-maximum suppression for overlapping detections.
 */
export function nms(detections: Detection[], iouThreshold: number): Detection[] {
  if (detections.length === 0) return []

  // Sort by confidence descending
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
