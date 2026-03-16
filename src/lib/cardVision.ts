/**
 * Pure computer vision card detection — NO machine learning.
 *
 * Pipeline:
 * 1. Convert camera frame to grayscale
 * 2. Adaptive threshold to find bright regions (cards on darker felt)
 * 3. Morphological cleanup (erode + dilate to remove noise)
 * 4. Connected component labeling to find blobs
 * 5. Filter blobs by size and aspect ratio to find cards
 * 6. For each card: extract corner, template-match rank, detect suit color
 *
 * All processing is pure JavaScript/Canvas — no external libraries.
 */

import { Card, Rank, Suit, Detection } from './types'

// ============================================================
// Constants
// ============================================================

const TEMPLATE_W = 24
const TEMPLATE_H = 36
const CORNER_FRAC_X = 0.22 // left 22% of card width for corner
const CORNER_FRAC_Y = 0.32 // top 32% of card height for corner

// Card aspect ratio: width/height ≈ 0.714 (2.5 x 3.5 inches)
const CARD_ASPECT_MIN = 0.35
const CARD_ASPECT_MAX = 0.95

// Minimum/maximum card area as fraction of total image area
const MIN_AREA_FRAC = 0.001
const MAX_AREA_FRAC = 0.25

// Minimum confidence to report a detection
const MIN_MATCH_CONFIDENCE = 0.25

const ALL_RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
const RANK_DISPLAY: Record<Rank, string> = {
  'A': 'A', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
  'J': 'J', 'Q': 'Q', 'K': 'K',
}

// ============================================================
// Template generation — render rank characters to small canvases
// ============================================================

interface RankTemplate {
  rank: Rank
  pixels: Uint8Array // binary: 0 or 255, TEMPLATE_W * TEMPLATE_H
}

let _templates: RankTemplate[] | null = null

/**
 * Generate binary templates for each rank by rendering text on a canvas.
 * We generate multiple font variants to improve matching against real cards.
 */
export function getRankTemplates(): RankTemplate[] {
  if (_templates) return _templates

  _templates = []
  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_W
  canvas.height = TEMPLATE_H
  const ctx = canvas.getContext('2d')!

  // Generate templates with multiple font styles for better matching
  const fonts = [
    { family: '"Times New Roman", Georgia, serif', weight: 'bold' },
    { family: 'Arial, Helvetica, sans-serif', weight: 'bold' },
    { family: '"Courier New", monospace', weight: 'bold' },
  ]

  for (const rank of ALL_RANKS) {
    const display = RANK_DISPLAY[rank]
    let bestTemplate: Uint8Array | null = null

    // Use the first font as the primary template (most card-like)
    for (const font of fonts) {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H)

      ctx.fillStyle = 'black'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const fontSize = display.length > 1 ? 20 : 26
      ctx.font = `${font.weight} ${fontSize}px ${font.family}`
      ctx.fillText(display, TEMPLATE_W / 2, TEMPLATE_H / 2)

      const imgData = ctx.getImageData(0, 0, TEMPLATE_W, TEMPLATE_H)
      const binary = new Uint8Array(TEMPLATE_W * TEMPLATE_H)

      for (let i = 0; i < binary.length; i++) {
        const r = imgData.data[i * 4]
        const g = imgData.data[i * 4 + 1]
        const b = imgData.data[i * 4 + 2]
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        binary[i] = gray < 128 ? 0 : 255
      }

      if (!bestTemplate) {
        bestTemplate = binary
      }

      // Add each font variant as a separate template
      _templates.push({ rank, pixels: binary })
    }
  }

  return _templates
}

// ============================================================
// Image processing utilities
// ============================================================

/** Convert RGBA ImageData to a flat grayscale Uint8Array */
export function toGrayscale(data: Uint8Array | Uint8ClampedArray, length: number): Uint8Array {
  const gray = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const off = i * 4
    gray[i] = Math.round(0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2])
  }
  return gray
}

/**
 * Otsu's method — find the optimal threshold to separate foreground/background.
 * Returns a binary Uint8Array (0 or 255).
 */
export function otsuThreshold(gray: Uint8Array, w: number, h: number): { binary: Uint8Array; threshold: number } {
  const total = w * h

  // Build histogram
  const hist = new Int32Array(256)
  for (let i = 0; i < total; i++) hist[gray[i]]++

  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]

  let sumB = 0
  let wB = 0
  let maxVar = 0
  let bestT = 0

  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break

    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) * (mB - mF)

    if (variance > maxVar) {
      maxVar = variance
      bestT = t
    }
  }

  const binary = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    binary[i] = gray[i] > bestT ? 255 : 0
  }

  return { binary, threshold: bestT }
}

/**
 * Adaptive (local mean) thresholding — handles uneven lighting better than Otsu.
 * Uses a block-based approach for speed.
 */
export function adaptiveThreshold(gray: Uint8Array, w: number, h: number, blockSize = 31, C = 8): Uint8Array {
  const binary = new Uint8Array(w * h)
  const half = Math.floor(blockSize / 2)

  // Build integral image for fast local mean computation
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x]
      integral[(y + 1) * (w + 1) + (x + 1)] = rowSum + integral[y * (w + 1) + (x + 1)]
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half)
      const y1 = Math.max(0, y - half)
      const x2 = Math.min(w - 1, x + half)
      const y2 = Math.min(h - 1, y + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)

      const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)]
        - integral[y1 * (w + 1) + (x2 + 1)]
        - integral[(y2 + 1) * (w + 1) + x1]
        + integral[y1 * (w + 1) + x1]

      const mean = sum / count
      binary[y * w + x] = gray[y * w + x] > mean - C ? 255 : 0
    }
  }

  return binary
}

/**
 * 3x3 morphological erosion (shrinks white regions).
 */
export function erode(binary: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // All 8 neighbors + center must be white
      let allWhite = true
      for (let dy = -1; dy <= 1 && allWhite; dy++) {
        for (let dx = -1; dx <= 1 && allWhite; dx++) {
          if (binary[(y + dy) * w + (x + dx)] === 0) allWhite = false
        }
      }
      out[y * w + x] = allWhite ? 255 : 0
    }
  }
  return out
}

/**
 * 3x3 morphological dilation (grows white regions).
 */
export function dilate(binary: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Any neighbor or center white → white
      let anyWhite = false
      for (let dy = -1; dy <= 1 && !anyWhite; dy++) {
        for (let dx = -1; dx <= 1 && !anyWhite; dx++) {
          if (binary[(y + dy) * w + (x + dx)] === 255) anyWhite = true
        }
      }
      out[y * w + x] = anyWhite ? 255 : 0
    }
  }
  return out
}

// ============================================================
// Connected component labeling (two-pass with union-find)
// ============================================================

interface BBox {
  minX: number; minY: number
  maxX: number; maxY: number
  area: number
  label: number
}

export function labelComponents(binary: Uint8Array, w: number, h: number): { labels: Int32Array; boxes: BBox[] } {
  const labels = new Int32Array(w * h)
  const parent: number[] = [0] // parent[0] unused (label 0 = background)
  let nextLabel = 1

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]] // path compression
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  // First pass: assign provisional labels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (binary[idx] === 0) continue // background

      const left = x > 0 ? labels[idx - 1] : 0
      const up = y > 0 ? labels[idx - w] : 0

      if (left === 0 && up === 0) {
        labels[idx] = nextLabel
        parent.push(nextLabel)
        nextLabel++
      } else if (left !== 0 && up === 0) {
        labels[idx] = left
      } else if (left === 0 && up !== 0) {
        labels[idx] = up
      } else {
        labels[idx] = left
        if (left !== up) union(left, up)
      }
    }
  }

  // Second pass: resolve labels
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0) {
      labels[i] = find(labels[i])
    }
  }

  // Compute bounding boxes
  const boxMap = new Map<number, BBox>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lbl = labels[y * w + x]
      if (lbl === 0) continue

      let box = boxMap.get(lbl)
      if (!box) {
        box = { minX: x, minY: y, maxX: x, maxY: y, area: 0, label: lbl }
        boxMap.set(lbl, box)
      }
      if (x < box.minX) box.minX = x
      if (x > box.maxX) box.maxX = x
      if (y < box.minY) box.minY = y
      if (y > box.maxY) box.maxY = y
      box.area++
    }
  }

  return { labels, boxes: Array.from(boxMap.values()) }
}

// ============================================================
// Template matching
// ============================================================

/**
 * Normalized cross-correlation between two binary images.
 * Returns a score between -1 and 1 (higher = better match).
 */
function ncc(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return -1

  const n = a.length
  let sumA = 0, sumB = 0
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i] }
  const meanA = sumA / n
  const meanB = sumB / n

  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }

  const den = Math.sqrt(denA * denB)
  return den === 0 ? 0 : num / den
}

/**
 * Extract a subregion from a grayscale image and resize to target dimensions.
 * Uses nearest-neighbor interpolation for speed.
 */
function extractAndResize(
  gray: Uint8Array, srcW: number,
  sx: number, sy: number, sw: number, sh: number,
  dstW: number, dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH)
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const srcX = Math.min(sx + Math.round(dx * sw / dstW), sx + sw - 1)
      const srcY = Math.min(sy + Math.round(dy * sh / dstH), sy + sh - 1)
      out[dy * dstW + dx] = gray[srcY * srcW + srcX]
    }
  }
  return out
}

/**
 * Binarize a grayscale region using a local threshold.
 */
function binarize(gray: Uint8Array): Uint8Array {
  // Use mean as threshold
  let sum = 0
  for (let i = 0; i < gray.length; i++) sum += gray[i]
  const mean = sum / gray.length
  const threshold = mean * 0.85 // slightly below mean to capture text

  const out = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] < threshold ? 0 : 255
  }
  return out
}

// ============================================================
// Suit detection via color analysis
// ============================================================

/**
 * Detect suit by analyzing the color of the card corner.
 * Suit doesn't affect basic strategy, so just use color (red→hearts, black→spades).
 */
function detectSuitColor(
  rgba: Uint8ClampedArray, imgW: number,
  box: BBox,
): Suit {
  const cardW = box.maxX - box.minX
  const cardH = box.maxY - box.minY
  const suitX = box.minX + Math.round(cardW * 0.02)
  const suitY = box.minY + Math.round(cardH * 0.15)
  const suitW = Math.round(cardW * CORNER_FRAC_X * 0.8)
  const suitH = Math.round(cardH * 0.12)

  let redCount = 0
  let blackCount = 0

  for (let y = suitY; y < suitY + suitH && y < box.maxY; y++) {
    for (let x = suitX; x < suitX + suitW && x < box.maxX; x++) {
      const off = (y * imgW + x) * 4
      const r = rgba[off]
      const g = rgba[off + 1]
      const b = rgba[off + 2]

      const brightness = (r + g + b) / 3
      if (brightness > 180) continue

      if (r > 120 && r > g * 1.5 && r > b * 1.5) {
        redCount++
      } else if (brightness < 100) {
        blackCount++
      }
    }
  }

  return redCount > blackCount ? 'h' : 's'
}

// ============================================================
// Main detection pipeline
// ============================================================

/**
 * Run detection with a given binary image. Returns card detections.
 */
function detectFromBinary(
  binary: Uint8Array, gray: Uint8Array, rgba: Uint8ClampedArray,
  w: number, h: number, totalArea: number, templates: RankTemplate[],
  skipMorph = false,
): Detection[] {
  // Morphological cleanup
  let cleaned: Uint8Array
  if (skipMorph) {
    cleaned = binary
  } else {
    const eroded = erode(binary, w, h)
    cleaned = dilate(eroded, w, h)
  }

  // Connected components
  const { boxes } = labelComponents(cleaned, w, h)

  // Filter for card-shaped rectangles
  const cardBoxes = boxes.filter(box => {
    const bw = box.maxX - box.minX
    const bh = box.maxY - box.minY
    if (bw < 10 || bh < 10) return false

    const area = bw * bh
    const areaFrac = area / totalArea
    if (areaFrac < MIN_AREA_FRAC || areaFrac > MAX_AREA_FRAC) return false

    const aspect = bw / bh
    if (aspect < CARD_ASPECT_MIN || aspect > CARD_ASPECT_MAX) return false

    // Check fill ratio — a card-shaped blob should fill most of its bounding box
    const fillRatio = box.area / area
    if (fillRatio < 0.4) return false

    return true
  })

  // For each card, identify rank and suit
  const detections: Detection[] = []

  for (const box of cardBoxes) {
    const cardW = box.maxX - box.minX
    const cardH = box.maxY - box.minY

    // Try both top-left and top-right corners (card may be upside down)
    const corners = [
      // Top-left corner
      { x: box.minX, y: box.minY },
      // Top-right corner (mirrored)
      { x: box.maxX - Math.max(8, Math.round(cardW * CORNER_FRAC_X)), y: box.minY },
    ]

    let bestRank: Rank = 'A'
    let bestScore = -Infinity

    for (const corner of corners) {
      const cornerW = Math.max(8, Math.round(cardW * CORNER_FRAC_X))
      const cornerH = Math.max(12, Math.round(cardH * CORNER_FRAC_Y))

      // Clamp corner within image bounds
      const cx = Math.max(0, Math.min(corner.x, w - cornerW))
      const cy = Math.max(0, Math.min(corner.y, h - cornerH))

      const cornerGray = extractAndResize(gray, w, cx, cy, cornerW, cornerH, TEMPLATE_W, TEMPLATE_H)
      const cornerBin = binarize(cornerGray)

      // Also try inverted (dark card with light text)
      const cornerBinInv = new Uint8Array(cornerBin.length)
      for (let i = 0; i < cornerBin.length; i++) {
        cornerBinInv[i] = cornerBin[i] === 0 ? 255 : 0
      }

      for (const tmpl of templates) {
        const score = ncc(cornerBin, tmpl.pixels)
        if (score > bestScore) {
          bestScore = score
          bestRank = tmpl.rank
        }
        // Also try inverted
        const scoreInv = ncc(cornerBinInv, tmpl.pixels)
        if (scoreInv > bestScore) {
          bestScore = scoreInv
          bestRank = tmpl.rank
        }
      }
    }

    // Skip low-confidence detections
    if (bestScore < MIN_MATCH_CONFIDENCE) continue

    // Detect suit via color
    const suit = detectSuitColor(rgba, w, box)

    // Normalize bounding box to [0, 1]
    const nx = box.minX / w
    const ny = box.minY / h
    const nw = cardW / w
    const nh = cardH / h

    detections.push({
      card: { rank: bestRank, suit },
      bbox: [nx, ny, nw, nh],
      confidence: Math.max(0, Math.min(1, (bestScore + 1) / 2)),
    })
  }

  return detections
}

export function detectCardsInFrame(imageData: ImageData): Detection[] {
  const w = imageData.width
  const h = imageData.height
  const totalArea = w * h
  const rgba = imageData.data

  // Step 1: Grayscale
  const gray = toGrayscale(rgba, w * h)

  const templates = getRankTemplates()

  // Strategy: try multiple thresholding approaches and pick the one that finds cards

  // Attempt 1: Otsu threshold + morphology
  const { binary: otsuBin } = otsuThreshold(gray, w, h)
  const otsuResults = detectFromBinary(otsuBin, gray, rgba, w, h, totalArea, templates)

  if (otsuResults.length > 0) {
    return otsuResults
  }

  // Attempt 2: Adaptive threshold (handles uneven lighting)
  const adaptiveBin = adaptiveThreshold(gray, w, h, 31, 8)
  const adaptiveResults = detectFromBinary(adaptiveBin, gray, rgba, w, h, totalArea, templates)

  if (adaptiveResults.length > 0) {
    return adaptiveResults
  }

  // Attempt 3: Otsu without morphological cleanup (small cards may get erased)
  const noMorphResults = detectFromBinary(otsuBin, gray, rgba, w, h, totalArea, templates, true)

  if (noMorphResults.length > 0) {
    return noMorphResults
  }

  // Attempt 4: Fixed high threshold (cards are typically bright white)
  const highBin = new Uint8Array(totalArea)
  for (let i = 0; i < totalArea; i++) {
    highBin[i] = gray[i] > 180 ? 255 : 0
  }
  const highResults = detectFromBinary(highBin, gray, rgba, w, h, totalArea, templates, true)

  return highResults
}
