import { Detection, Zone, CalibrationData, Card } from './types'
import { cardToString } from './handEvaluator'

export interface MappedDetections {
  dealerCards: Detection[]
  playerCards: Detection[][] // array of arrays for split hands
}

const DEFAULT_CALIBRATION: CalibrationData = {
  dealerZone: { x: 0.1, y: 0.0, width: 0.8, height: 0.4 },
  playerZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.45 },
}

/**
 * Check if a detection's center point falls within a zone.
 */
function isInZone(det: Detection, zone: Zone): boolean {
  const cx = det.bbox[0] + det.bbox[2] / 2
  const cy = det.bbox[1] + det.bbox[3] / 2
  return (
    cx >= zone.x &&
    cx <= zone.x + zone.width &&
    cy >= zone.y &&
    cy <= zone.y + zone.height
  )
}

/**
 * Cluster detections horizontally to detect split hands.
 * If cards are separated by a significant gap, they're separate hands.
 */
function clusterHands(detections: Detection[]): Detection[][] {
  if (detections.length <= 2) return [detections]

  // Sort by x center position
  const sorted = [...detections].sort((a, b) => {
    const acx = a.bbox[0] + a.bbox[2] / 2
    const bcx = b.bbox[0] + b.bbox[2] / 2
    return acx - bcx
  })

  const clusters: Detection[][] = [[sorted[0]]]

  for (let i = 1; i < sorted.length; i++) {
    const prevCx = sorted[i - 1].bbox[0] + sorted[i - 1].bbox[2] / 2
    const currCx = sorted[i].bbox[0] + sorted[i].bbox[2] / 2
    const gap = currCx - prevCx

    // If gap is >20% of the zone width, start new cluster
    if (gap > 0.2) {
      clusters.push([sorted[i]])
    } else {
      clusters[clusters.length - 1].push(sorted[i])
    }
  }

  return clusters
}

/**
 * Deduplicate detections of the same card (e.g., slight movement causing double-detect).
 * Keep the one with highest confidence.
 */
function deduplicateCards(detections: Detection[]): Detection[] {
  const seen = new Map<string, Detection>()

  for (const det of detections) {
    const key = cardToString(det.card)
    const existing = seen.get(key)
    if (!existing || det.confidence > existing.confidence) {
      seen.set(key, det)
    }
  }

  return Array.from(seen.values())
}

/**
 * Map raw detections to dealer/player zones using calibration data.
 */
export function mapDetections(
  detections: Detection[],
  calibration?: CalibrationData | null
): MappedDetections {
  const cal = calibration ?? DEFAULT_CALIBRATION

  const dealerRaw = detections.filter(d => isInZone(d, cal.dealerZone))
  const playerRaw = detections.filter(d => isInZone(d, cal.playerZone))

  const dealerCards = deduplicateCards(dealerRaw)
  const playerDeduped = deduplicateCards(playerRaw)
  const playerCards = clusterHands(playerDeduped)

  return { dealerCards, playerCards }
}

export { DEFAULT_CALIBRATION }
