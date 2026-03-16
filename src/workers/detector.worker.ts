/**
 * Web Worker for card detection using TensorFlow.js + YOLOv8.
 *
 * Runs inference off the main thread to keep the UI responsive.
 * Communicates via postMessage with the CardDetector class.
 */

import * as tf from '@tensorflow/tfjs'
import { Detection, Rank, Suit } from '@/lib/types'
import { CLASS_LABELS, labelToCard, nms, DetectorConfig, WorkerMessage } from '@/lib/cardDetector'

let model: tf.GraphModel | null = null
let config: DetectorConfig
const INPUT_SIZE = 640 // YOLOv8 standard input size

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'init':
      config = msg.config
      try {
        await tf.ready()
        // Try to use WebGL backend for GPU acceleration
        await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'))

        model = await tf.loadGraphModel(config.modelUrl)

        // Warm up with a dummy input
        const dummy = tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3])
        await model.predict(dummy)
        dummy.dispose()

        self.postMessage({ type: 'ready' } as WorkerMessage)
      } catch (err) {
        self.postMessage({
          type: 'error',
          message: `Model load failed: ${err}. Card detection will be unavailable.`,
        } as WorkerMessage)
      }
      break

    case 'detect':
      if (!model) return

      try {
        const detections = await runDetection(msg.imageData)
        self.postMessage({
          type: 'detections',
          detections,
          frameId: msg.frameId,
        } as WorkerMessage)
      } catch (err) {
        console.error('Detection error:', err)
      }
      break
  }
}

async function runDetection(imageData: ImageData): Promise<Detection[]> {
  if (!model) return []

  const imgWidth = imageData.width
  const imgHeight = imageData.height

  // Preprocess: resize to INPUT_SIZE x INPUT_SIZE, normalize to [0,1]
  const tensor = tf.tidy(() => {
    // Create a tensor directly from raw pixel data
    const rawData = new Uint8Array(imageData.data.buffer)
    const img = tf.tensor3d(rawData as unknown as number[], [imgHeight, imgWidth, 4], 'int32')
      .slice([0, 0, 0], [-1, -1, 3]) // Drop alpha channel
    const resized = tf.image.resizeBilinear(img, [INPUT_SIZE, INPUT_SIZE])
    const normalized = resized.div(255.0)
    return normalized.expandDims(0) // [1, 640, 640, 3]
  })

  // Run inference
  const output = await model.predict(tensor) as tf.Tensor
  tensor.dispose()

  // YOLOv8 output shape: [1, 56, 8400] where 56 = 4 (bbox) + 52 (classes)
  // Transpose to [8400, 56] for easier processing
  const data = tf.tidy(() => {
    const squeezed = output.squeeze([0]) // [56, 8400]
    return squeezed.transpose([1, 0]) // [8400, 56]
  })
  output.dispose()

  const rawData = await data.array() as number[][]
  data.dispose()

  const detections: Detection[] = []

  for (const row of rawData) {
    // First 4 values are bbox: cx, cy, w, h (in pixel coords relative to INPUT_SIZE)
    const cx = row[0]
    const cy = row[1]
    const w = row[2]
    const h = row[3]

    // Remaining values are class scores
    const classScores = row.slice(4)
    const maxScore = Math.max(...classScores)

    if (maxScore < config.confidenceThreshold) continue

    const classIdx = classScores.indexOf(maxScore)
    if (classIdx < 0 || classIdx >= CLASS_LABELS.length) continue

    // Convert to normalized coordinates [0,1]
    const x = (cx - w / 2) / INPUT_SIZE
    const y = (cy - h / 2) / INPUT_SIZE
    const nw = w / INPUT_SIZE
    const nh = h / INPUT_SIZE

    detections.push({
      card: labelToCard(CLASS_LABELS[classIdx]),
      bbox: [x, y, nw, nh],
      confidence: maxScore,
    })
  }

  // Apply NMS
  return nms(detections, config.iouThreshold)
}
