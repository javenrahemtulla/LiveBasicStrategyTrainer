import { Card, GamePhase, Action, Detection, Decision } from './types'
import { MappedDetections } from './spatialMapper'
import { evaluateHand, cardToString } from './handEvaluator'
import { getCorrectAction, actionName } from './basicStrategy'

/**
 * Game state machine that tracks blackjack hand flow by observing
 * card detections from the camera.
 *
 * Uses stability timers to avoid reacting to flickering detections.
 * A card must be consistently detected for STABILITY_MS before being registered.
 */

const STABILITY_MS = 1000 // Card must be stable for 1 second
const CLEAR_TIMEOUT_MS = 3000 // Table considered cleared after 3s with no cards
const SETTLEMENT_DELAY_MS = 2000 // Time to show settlement before resetting

interface StableCard {
  card: Card
  firstSeen: number
  stable: boolean
}

export interface GameEvent {
  type: 'hand_started' | 'player_action' | 'dealer_action' | 'hand_settled' | 'strategy_feedback'
  data?: Record<string, unknown>
}

export class GameStateMachine {
  private phase: GamePhase = 'idle'
  private dealerCards: Card[] = []
  private playerHands: Card[][] = [[]]
  private activeHandIndex = 0

  // Tracking for stability
  private dealerTracking = new Map<string, StableCard>()
  private playerTracking = new Map<string, StableCard>()
  private lastDetectionTime = 0
  private clearTimer: ReturnType<typeof setTimeout> | null = null

  // Callbacks
  private onEvent: (event: GameEvent) => void

  constructor(onEvent: (event: GameEvent) => void) {
    this.onEvent = onEvent
  }

  getPhase(): GamePhase {
    return this.phase
  }

  getDealerCards(): Card[] {
    return [...this.dealerCards]
  }

  getPlayerHands(): Card[][] {
    return this.playerHands.map(h => [...h])
  }

  getActiveHandIndex(): number {
    return this.activeHandIndex
  }

  /**
   * Process new mapped detections from the spatial mapper.
   * Called on each frame (~5 FPS).
   */
  processDetections(mapped: MappedDetections, timestamp: number = Date.now()) {
    this.lastDetectionTime = timestamp

    // Reset clear timer
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
      this.clearTimer = null
    }

    const totalCards = mapped.dealerCards.length + mapped.playerCards.flat().length

    if (totalCards === 0) {
      // Start clear timer
      this.clearTimer = setTimeout(() => {
        this.handleTableCleared()
      }, CLEAR_TIMEOUT_MS)
      return
    }

    // Update stable card tracking
    const newDealerStable = this.updateTracking(this.dealerTracking, mapped.dealerCards, timestamp)
    const newPlayerStable = this.updatePlayerTracking(mapped.playerCards, timestamp)

    // Process state transitions
    switch (this.phase) {
      case 'idle':
        this.processIdle(newDealerStable, newPlayerStable)
        break
      case 'dealing':
        this.processDealing(newDealerStable, newPlayerStable)
        break
      case 'player_turn':
        this.processPlayerTurn(newPlayerStable)
        break
      case 'dealer_turn':
        this.processDealerTurn(newDealerStable)
        break
      case 'settlement':
        // Just wait for table clear
        break
    }
  }

  private updateTracking(
    tracking: Map<string, StableCard>,
    detections: Detection[],
    timestamp: number
  ): Card[] {
    const newStable: Card[] = []
    const currentKeys = new Set<string>()

    for (const det of detections) {
      const key = cardToString(det.card)
      currentKeys.add(key)

      const existing = tracking.get(key)
      if (existing) {
        if (!existing.stable && timestamp - existing.firstSeen >= STABILITY_MS) {
          existing.stable = true
          newStable.push(det.card)
        }
      } else {
        tracking.set(key, { card: det.card, firstSeen: timestamp, stable: false })
      }
    }

    // Remove cards that disappeared
    tracking.forEach((_, key) => {
      if (!currentKeys.has(key)) {
        tracking.delete(key)
      }
    })

    return newStable
  }

  private updatePlayerTracking(
    playerCardGroups: Detection[][],
    timestamp: number
  ): Card[] {
    const allPlayerDetections = playerCardGroups.flat()
    return this.updateTracking(this.playerTracking, allPlayerDetections, timestamp)
  }

  private processIdle(newDealerStable: Card[], newPlayerStable: Card[]) {
    const stableDealerCount = Array.from(this.dealerTracking.values()).filter(c => c.stable).length
    const stablePlayerCount = Array.from(this.playerTracking.values()).filter(c => c.stable).length

    // Transition to dealing when we see cards appearing
    if (stableDealerCount >= 1 && stablePlayerCount >= 1) {
      this.phase = 'dealing'
      this.dealerCards = []
      this.playerHands = [[]]
      this.activeHandIndex = 0
      this.processDealing(newDealerStable, newPlayerStable)
    }
  }

  private processDealing(newDealerStable: Card[], newPlayerStable: Card[]) {
    // Add newly stable cards
    for (const card of newDealerStable) {
      if (!this.dealerCards.some(c => cardToString(c) === cardToString(card))) {
        this.dealerCards.push(card)
      }
    }
    for (const card of newPlayerStable) {
      if (!this.playerHands[0].some(c => cardToString(c) === cardToString(card))) {
        this.playerHands[0].push(card)
      }
    }

    // Transition to player turn when deal is complete (2 player cards, 1+ dealer card)
    if (this.playerHands[0].length >= 2 && this.dealerCards.length >= 1) {
      this.phase = 'player_turn'

      // Check for blackjack
      const hand = evaluateHand(this.playerHands[0])
      if (hand.isBlackjack) {
        this.onEvent({
          type: 'hand_started',
          data: { blackjack: true, playerCards: this.playerHands[0], dealerUpcard: this.dealerCards[0] },
        })
        this.phase = 'dealer_turn'
      } else {
        this.onEvent({
          type: 'hand_started',
          data: { playerCards: this.playerHands[0], dealerUpcard: this.dealerCards[0] },
        })
        this.emitStrategyHint()
      }
    }
  }

  private processPlayerTurn(newPlayerStable: Card[]) {
    const currentHand = this.playerHands[this.activeHandIndex]

    for (const card of newPlayerStable) {
      const key = cardToString(card)
      const alreadyInAnyHand = this.playerHands.flat().some(c => cardToString(c) === key)
      if (alreadyInAnyHand) continue

      // New card in player zone = HIT (or first card after split)
      currentHand.push(card)

      const action: Action = currentHand.length === 3 ? 'H' : 'H' // Hit detected
      this.evaluateAction(action)

      // Check for bust
      const handValue = evaluateHand(currentHand)
      if (handValue.isBust) {
        this.onEvent({ type: 'player_action', data: { action: 'bust', hand: currentHand } })
        this.advanceHand()
      } else if (handValue.best === 21) {
        // Auto-stand on 21
        this.advanceHand()
      }
    }

    // Check if dealer got new stable cards while player was playing
    // This means player stood (no new player card, dealer started drawing)
    const newDealerCards = Array.from(this.dealerTracking.values())
      .filter(c => c.stable && !this.dealerCards.some(dc => cardToString(dc) === cardToString(c.card)))

    if (newDealerCards.length > 0 && newPlayerStable.length === 0) {
      // Player stood - dealer is now drawing
      this.evaluateAction('S')

      for (const sc of newDealerCards) {
        this.dealerCards.push(sc.card)
      }

      this.phase = 'dealer_turn'
      this.onEvent({ type: 'player_action', data: { action: 'stand' } })
    }
  }

  private processDealerTurn(newDealerStable: Card[]) {
    for (const card of newDealerStable) {
      const key = cardToString(card)
      if (!this.dealerCards.some(c => cardToString(c) === key)) {
        this.dealerCards.push(card)
        this.onEvent({ type: 'dealer_action', data: { card, dealerHand: this.dealerCards } })
      }
    }

    // Check if dealer is done (hand value >= 17)
    const dealerValue = evaluateHand(this.dealerCards)
    if (this.dealerCards.length >= 2 && (dealerValue.best >= 17 || dealerValue.isBust)) {
      this.settleHand()
    }
  }

  private advanceHand() {
    this.activeHandIndex++
    if (this.activeHandIndex >= this.playerHands.length) {
      this.phase = 'dealer_turn'
    } else {
      this.emitStrategyHint()
    }
  }

  private evaluateAction(action: Action) {
    if (this.dealerCards.length === 0) return

    const currentHand = this.playerHands[this.activeHandIndex]
    // Evaluate against the hand BEFORE the action was taken
    const handBeforeAction = action === 'H' ? currentHand.slice(0, -1) : currentHand

    if (handBeforeAction.length < 2) return

    const correctAction = getCorrectAction({
      playerCards: handBeforeAction,
      dealerUpcard: this.dealerCards[0],
      canDouble: handBeforeAction.length === 2,
      canSplit: handBeforeAction.length === 2 && handBeforeAction[0].rank === handBeforeAction[1].rank,
    })

    const isCorrect = action === correctAction

    const decision: Decision = {
      playerCards: [...handBeforeAction],
      dealerUpcard: this.dealerCards[0],
      action,
      correctAction,
      isCorrect,
      handIndex: this.activeHandIndex,
    }

    this.onEvent({
      type: 'strategy_feedback',
      data: {
        decision,
        message: isCorrect
          ? 'Correct!'
          : `Should ${actionName(correctAction)} (you ${actionName(action).toLowerCase()}ed)`,
      },
    })
  }

  private emitStrategyHint() {
    if (this.dealerCards.length === 0 || this.playerHands[this.activeHandIndex].length < 2) return

    const correctAction = getCorrectAction({
      playerCards: this.playerHands[this.activeHandIndex],
      dealerUpcard: this.dealerCards[0],
    })

    this.onEvent({
      type: 'strategy_feedback',
      data: { hint: actionName(correctAction) },
    })
  }

  private settleHand() {
    const dealerValue = evaluateHand(this.dealerCards)

    for (let i = 0; i < this.playerHands.length; i++) {
      const playerValue = evaluateHand(this.playerHands[i])
      let result: string

      if (playerValue.isBust) {
        result = 'loss'
      } else if (playerValue.isBlackjack && !dealerValue.isBlackjack) {
        result = 'blackjack'
      } else if (dealerValue.isBust) {
        result = 'win'
      } else if (playerValue.best > dealerValue.best) {
        result = 'win'
      } else if (playerValue.best < dealerValue.best) {
        result = 'loss'
      } else {
        result = 'push'
      }

      this.onEvent({
        type: 'hand_settled',
        data: {
          handIndex: i,
          result,
          playerValue: playerValue.best,
          dealerValue: dealerValue.best,
        },
      })
    }

    this.phase = 'settlement'
  }

  private handleTableCleared() {
    if (this.phase === 'idle') return

    // If we were in the middle of a hand, settle it
    if (this.phase !== 'settlement') {
      // Table was cleared unexpectedly - treat as a reset
      this.onEvent({ type: 'hand_settled', data: { result: 'cleared' } })
    }

    // Reset everything
    this.phase = 'idle'
    this.dealerCards = []
    this.playerHands = [[]]
    this.activeHandIndex = 0
    this.dealerTracking.clear()
    this.playerTracking.clear()
  }

  /**
   * Manual reset (e.g., user presses reset button).
   */
  reset() {
    this.handleTableCleared()
  }
}
