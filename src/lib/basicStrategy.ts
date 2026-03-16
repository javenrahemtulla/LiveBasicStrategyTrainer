import { Card, Action, StrategyAction, Rank } from './types'
import { evaluateHand, isPair, cardValue } from './handEvaluator'

/**
 * Complete basic strategy for 6-deck, S17, DAS allowed.
 *
 * Tables indexed as [playerTotal/pairRank][dealerUpcard]
 * Dealer upcard: 2,3,4,5,6,7,8,9,T,A (index 0-9)
 *
 * Actions:
 *   H  = Hit
 *   S  = Stand
 *   D  = Double if allowed, else Hit
 *   Ds = Double if allowed, else Stand
 *   P  = Split
 *   Ph = Split if DAS allowed, else Hit
 */

// Dealer upcard order for table indexing
const DEALER_INDEX: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4,
  '7': 5, '8': 6, '9': 7, 'T': 8, 'A': 9,
}

function dealerIdx(upcard: Card): number {
  const rank = upcard.rank
  if (rank === 'J' || rank === 'Q' || rank === 'K') return DEALER_INDEX['T']
  return DEALER_INDEX[rank]
}

// Hard totals: rows = player hard total 5-21
// Columns = dealer 2,3,4,5,6,7,8,9,T,A
const HARD: Record<number, StrategyAction[]> = {
  //                 2    3    4    5    6    7    8    9    T    A
  5:              ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6:              ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7:              ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8:              ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9:              ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10:             ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11:             ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'],
  12:             ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13:             ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14:             ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15:             ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  16:             ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  17:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

// Soft totals: rows = player soft total 13-21 (A+2 through A+T)
const SOFT: Record<number, StrategyAction[]> = {
  //                 2    3    4    5    6    7    8    9    T    A
  13:             ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  14:             ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  15:             ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  16:             ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  17:             ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  18:             ['Ds','Ds','Ds','Ds','Ds','S', 'S', 'H', 'H', 'H'],
  19:             ['S', 'S', 'S', 'S', 'Ds','S', 'S', 'S', 'S', 'S'],
  20:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

// Pairs: rows indexed by pair card value (2-11, where 11=A)
const PAIRS: Record<number, StrategyAction[]> = {
  //                 2    3    4    5    6    7    8    9    T    A
  2:              ['Ph','Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  3:              ['Ph','Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  4:              ['H', 'H', 'H', 'Ph','Ph','H', 'H', 'H', 'H', 'H'],
  5:              ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  6:              ['Ph','P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  7:              ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  8:              ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  9:              ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
  10:             ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  11:             ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
}

/**
 * Resolve a strategy action to a concrete action given what's allowed.
 */
function resolveAction(sa: StrategyAction, canDouble: boolean, canSplit: boolean, dasAllowed: boolean): Action {
  switch (sa) {
    case 'H': return 'H'
    case 'S': return 'S'
    case 'D': return canDouble ? 'D' : 'H'
    case 'Ds': return canDouble ? 'D' : 'S'
    case 'P': return canSplit ? 'P' : 'H' // fallback to hit if can't split
    case 'Ph': return (canSplit && dasAllowed) ? 'P' : 'H'
    default: return 'H'
  }
}

export interface StrategyInput {
  playerCards: Card[]
  dealerUpcard: Card
  canDouble?: boolean
  canSplit?: boolean
  dasAllowed?: boolean
}

/**
 * Look up the correct basic strategy action.
 */
export function getCorrectAction(input: StrategyInput): Action {
  const { playerCards, dealerUpcard } = input
  const canDouble = input.canDouble ?? (playerCards.length === 2)
  const canSplit = input.canSplit ?? (playerCards.length === 2)
  const dasAllowed = input.dasAllowed ?? true

  const hand = evaluateHand(playerCards)
  const di = dealerIdx(dealerUpcard)

  // Check pairs first
  if (playerCards.length === 2 && isPair(playerCards)) {
    const pv = cardValue(playerCards[0].rank)
    const row = PAIRS[pv]
    if (row) {
      return resolveAction(row[di], canDouble, canSplit, dasAllowed)
    }
  }

  // Check soft totals
  if (hand.isSoft && hand.best >= 13 && hand.best <= 21) {
    const row = SOFT[hand.best]
    if (row) {
      return resolveAction(row[di], canDouble, false, dasAllowed)
    }
  }

  // Hard totals
  const total = hand.best
  if (total >= 5 && total <= 21) {
    const row = HARD[total]
    if (row) {
      return resolveAction(row[di], canDouble, false, dasAllowed)
    }
  }

  // Default: hit on anything below 5 (shouldn't really happen)
  return 'H'
}

/** Human-readable action name */
export function actionName(action: Action): string {
  switch (action) {
    case 'H': return 'Hit'
    case 'S': return 'Stand'
    case 'D': return 'Double'
    case 'P': return 'Split'
  }
}
