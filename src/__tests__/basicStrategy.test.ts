import { describe, it, expect } from 'vitest'
import { getCorrectAction } from '@/lib/basicStrategy'
import { Card, Action, Rank } from '@/lib/types'

function c(rank: string, suit: string = 'h'): Card {
  return { rank: rank as Rank, suit: suit as Card['suit'] }
}

function expectAction(playerRanks: string[], dealerRank: string, expected: Action) {
  const playerCards = playerRanks.map(r => c(r))
  const dealerUpcard = c(dealerRank)
  const result = getCorrectAction({ playerCards, dealerUpcard })
  expect(result).toBe(expected)
}

describe('basic strategy - hard totals', () => {
  it('always hit hard 8 or less', () => {
    expectAction(['3', '4'], '7', 'H')
    expectAction(['2', '3'], 'A', 'H')
    expectAction(['3', '5'], '5', 'H')
  })

  it('hard 9: double vs 3-6, hit otherwise', () => {
    expectAction(['4', '5'], '3', 'D')
    expectAction(['4', '5'], '5', 'D')
    expectAction(['4', '5'], '2', 'H')
    expectAction(['4', '5'], '7', 'H')
    expectAction(['4', '5'], 'A', 'H')
  })

  it('hard 10: double vs 2-9, hit vs T/A', () => {
    expectAction(['4', '6'], '2', 'D')
    expectAction(['4', '6'], '9', 'D')
    expectAction(['4', '6'], 'T', 'H')
    expectAction(['4', '6'], 'A', 'H')
  })

  it('hard 11: always double', () => {
    expectAction(['5', '6'], '2', 'D')
    expectAction(['5', '6'], 'A', 'D')
    expectAction(['5', '6'], 'T', 'D')
  })

  it('hard 12: stand vs 4-6, hit otherwise', () => {
    expectAction(['4', '8'], '4', 'S')
    expectAction(['4', '8'], '6', 'S')
    expectAction(['4', '8'], '2', 'H')
    expectAction(['4', '8'], '3', 'H')
    expectAction(['4', '8'], '7', 'H')
  })

  it('hard 13-16: stand vs 2-6, hit otherwise', () => {
    expectAction(['T', '3'], '5', 'S')
    expectAction(['T', '3'], '7', 'H')
    expectAction(['T', '6'], '2', 'S')
    expectAction(['T', '6'], 'T', 'H')
    expectAction(['T', '5'], 'A', 'H')
  })

  it('hard 17+: always stand', () => {
    expectAction(['T', '7'], '2', 'S')
    expectAction(['T', '7'], 'A', 'S')
    expectAction(['T', 'T'], '6', 'S')
  })

  it('hard 9 with 3 cards cannot double', () => {
    // 3+3+3=9 vs dealer 5, can't double with 3 cards, so hit
    expectAction(['3', '3', '3'], '5', 'H')
  })
})

describe('basic strategy - soft totals', () => {
  it('soft 13/14: double vs 5-6, hit otherwise', () => {
    expectAction(['A', '2'], '5', 'D')
    expectAction(['A', '2'], '6', 'D')
    expectAction(['A', '2'], '4', 'H')
    expectAction(['A', '3'], '7', 'H')
  })

  it('soft 15/16: double vs 4-6, hit otherwise', () => {
    expectAction(['A', '4'], '4', 'D')
    expectAction(['A', '4'], '6', 'D')
    expectAction(['A', '4'], '3', 'H')
    expectAction(['A', '5'], '7', 'H')
  })

  it('soft 17: double vs 3-6, hit otherwise', () => {
    expectAction(['A', '6'], '3', 'D')
    expectAction(['A', '6'], '6', 'D')
    expectAction(['A', '6'], '2', 'H')
    expectAction(['A', '6'], '7', 'H')
  })

  it('soft 18: double vs 2-6 (stand if cant), stand vs 7-8, hit vs 9-A', () => {
    expectAction(['A', '7'], '3', 'D') // Ds -> D when can double
    expectAction(['A', '7'], '7', 'S')
    expectAction(['A', '7'], '8', 'S')
    expectAction(['A', '7'], '9', 'H')
    expectAction(['A', '7'], 'T', 'H')
    expectAction(['A', '7'], 'A', 'H')
  })

  it('soft 18 with 3 cards: stand vs 2-6 (cant double), stand vs 7-8, hit vs 9+', () => {
    // A+3+4=soft 18, can't double
    expectAction(['A', '3', '4'], '4', 'S') // Ds resolves to S when can't double
    expectAction(['A', '3', '4'], '9', 'H')
  })

  it('soft 19: stand (double vs 6 if allowed)', () => {
    expectAction(['A', '8'], '6', 'D') // Ds -> D
    expectAction(['A', '8'], '2', 'S')
    expectAction(['A', '8'], 'T', 'S')
  })

  it('soft 20+: always stand', () => {
    expectAction(['A', '9'], '5', 'S')
    expectAction(['A', '9'], 'A', 'S')
  })
})

describe('basic strategy - pairs', () => {
  it('always split aces', () => {
    expectAction(['A', 'A'], '2', 'P')
    expectAction(['A', 'A'], 'T', 'P')
    expectAction(['A', 'A'], 'A', 'P')
  })

  it('always split 8s', () => {
    expectAction(['8', '8'], '2', 'P')
    expectAction(['8', '8'], 'T', 'P')
    expectAction(['8', '8'], 'A', 'P')
  })

  it('never split tens', () => {
    expectAction(['T', 'T'], '5', 'S')
    expectAction(['T', 'T'], '6', 'S')
  })

  it('never split fives (double instead)', () => {
    expectAction(['5', '5'], '5', 'D')
    expectAction(['5', '5'], 'T', 'H')
  })

  it('split 2s/3s: split vs 2-7 (DAS), hit otherwise', () => {
    expectAction(['2', '2'], '2', 'P') // Ph with DAS = P
    expectAction(['2', '2'], '7', 'P')
    expectAction(['2', '2'], '8', 'H')
    expectAction(['3', '3'], '3', 'P')
    expectAction(['3', '3'], 'T', 'H')
  })

  it('split 4s: split vs 5-6 (DAS), hit otherwise', () => {
    expectAction(['4', '4'], '5', 'P')
    expectAction(['4', '4'], '6', 'P')
    expectAction(['4', '4'], '4', 'H')
    expectAction(['4', '4'], '7', 'H')
  })

  it('split 6s: split vs 2-6 (DAS for 2), hit otherwise', () => {
    expectAction(['6', '6'], '2', 'P') // Ph with DAS = P
    expectAction(['6', '6'], '6', 'P')
    expectAction(['6', '6'], '7', 'H')
  })

  it('split 7s: split vs 2-7, hit otherwise', () => {
    expectAction(['7', '7'], '2', 'P')
    expectAction(['7', '7'], '7', 'P')
    expectAction(['7', '7'], '8', 'H')
  })

  it('split 9s: split vs 2-9 except 7, stand vs 7/T/A', () => {
    expectAction(['9', '9'], '2', 'P')
    expectAction(['9', '9'], '6', 'P')
    expectAction(['9', '9'], '7', 'S')
    expectAction(['9', '9'], '8', 'P')
    expectAction(['9', '9'], '9', 'P')
    expectAction(['9', '9'], 'T', 'S')
    expectAction(['9', '9'], 'A', 'S')
  })

  it('face card pairs treated same as TT', () => {
    expectAction(['J', 'J'], '5', 'S')
    expectAction(['Q', 'Q'], '6', 'S')
    expectAction(['K', 'K'], 'A', 'S')
  })

  it('pairs without DAS: 2,2 vs 2 = hit (Ph resolves to H)', () => {
    const result = getCorrectAction({
      playerCards: [c('2'), c('2')],
      dealerUpcard: c('2'),
      dasAllowed: false,
    })
    expect(result).toBe('H')
  })
})
