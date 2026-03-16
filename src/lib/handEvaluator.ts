import { Card, HandValue, Rank } from './types'

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11,
}

export function cardValue(rank: Rank): number {
  return RANK_VALUES[rank]
}

export function evaluateHand(cards: Card[]): HandValue {
  if (cards.length === 0) {
    return { hard: 0, soft: null, isSoft: false, best: 0, isBust: false, isBlackjack: false }
  }

  let total = 0
  let aces = 0

  for (const card of cards) {
    total += RANK_VALUES[card.rank]
    if (card.rank === 'A') aces++
  }

  // Reduce aces from 11 to 1 as needed
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }

  const hardTotal = cards.reduce((sum, c) => sum + (c.rank === 'A' ? 1 : RANK_VALUES[c.rank]), 0)
  const hasSoftAce = aces > 0 && total !== hardTotal

  const isBlackjack = cards.length === 2 && total === 21

  return {
    hard: hardTotal,
    soft: hasSoftAce ? total : null,
    isSoft: hasSoftAce,
    best: total,
    isBust: total > 21,
    isBlackjack,
  }
}

/** Get the dealer upcard value (2-11, where 11 = Ace) */
export function upcardValue(card: Card): number {
  return RANK_VALUES[card.rank] === 11 ? 11 : RANK_VALUES[card.rank]
}

/** Check if a hand is a pair (for split decisions) */
export function isPair(cards: Card[]): boolean {
  if (cards.length !== 2) return false
  return cards[0].rank === cards[1].rank
}

/** Get the pair rank value for strategy lookup. T/J/Q/K are all 10. */
export function pairValue(cards: Card[]): number {
  if (!isPair(cards)) return 0
  return RANK_VALUES[cards[0].rank]
}

/** Display a card as a short string like "Ah" or "Tc" */
export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`
}

/** Display a hand value like "17" or "S17" (soft 17) */
export function handValueToString(value: HandValue): string {
  if (value.isBlackjack) return 'BJ'
  if (value.isBust) return `${value.best} BUST`
  if (value.isSoft) return `S${value.best}`
  return `${value.best}`
}
