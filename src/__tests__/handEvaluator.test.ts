import { describe, it, expect } from 'vitest'
import { evaluateHand, isPair, cardToString, handValueToString } from '@/lib/handEvaluator'
import { Card } from '@/lib/types'

function c(rank: string, suit: string = 'h'): Card {
  return { rank: rank as Card['rank'], suit: suit as Card['suit'] }
}

describe('evaluateHand', () => {
  it('evaluates a simple hard hand', () => {
    const result = evaluateHand([c('T'), c('7')])
    expect(result.best).toBe(17)
    expect(result.isSoft).toBe(false)
    expect(result.isBust).toBe(false)
    expect(result.isBlackjack).toBe(false)
  })

  it('evaluates blackjack', () => {
    const result = evaluateHand([c('A'), c('K')])
    expect(result.best).toBe(21)
    expect(result.isBlackjack).toBe(true)
    expect(result.isSoft).toBe(true)
  })

  it('evaluates soft hand (A+6)', () => {
    const result = evaluateHand([c('A'), c('6')])
    expect(result.best).toBe(17)
    expect(result.isSoft).toBe(true)
    expect(result.soft).toBe(17)
    expect(result.hard).toBe(7)
  })

  it('evaluates A+5+T as hard 16', () => {
    const result = evaluateHand([c('A'), c('5'), c('T')])
    expect(result.best).toBe(16)
    expect(result.isSoft).toBe(false)
  })

  it('evaluates two aces as soft 12', () => {
    const result = evaluateHand([c('A'), c('A')])
    expect(result.best).toBe(12)
    expect(result.isSoft).toBe(true)
  })

  it('evaluates bust hand', () => {
    const result = evaluateHand([c('T'), c('8'), c('6')])
    expect(result.best).toBe(24)
    expect(result.isBust).toBe(true)
  })

  it('evaluates three cards summing to 21 as not blackjack', () => {
    const result = evaluateHand([c('7'), c('7'), c('7')])
    expect(result.best).toBe(21)
    expect(result.isBlackjack).toBe(false)
  })

  it('evaluates A+A+9 correctly', () => {
    const result = evaluateHand([c('A'), c('A'), c('9')])
    expect(result.best).toBe(21)
    expect(result.isSoft).toBe(true)
  })

  it('evaluates A+A+A correctly', () => {
    const result = evaluateHand([c('A'), c('A'), c('A')])
    expect(result.best).toBe(13)
    expect(result.isSoft).toBe(true)
  })

  it('evaluates empty hand', () => {
    const result = evaluateHand([])
    expect(result.best).toBe(0)
  })

  it('face cards all worth 10', () => {
    expect(evaluateHand([c('J'), c('Q')]).best).toBe(20)
    expect(evaluateHand([c('K'), c('T')]).best).toBe(20)
  })
})

describe('isPair', () => {
  it('identifies pairs', () => {
    expect(isPair([c('8'), c('8')])).toBe(true)
    expect(isPair([c('A'), c('A')])).toBe(true)
  })

  it('non-pairs', () => {
    expect(isPair([c('T'), c('J')])).toBe(false) // both 10-value but different rank
    expect(isPair([c('8'), c('8'), c('8')])).toBe(false) // 3 cards
  })
})

describe('display functions', () => {
  it('cardToString', () => {
    expect(cardToString(c('A', 'h'))).toBe('Ah')
    expect(cardToString(c('T', 's'))).toBe('Ts')
  })

  it('handValueToString', () => {
    expect(handValueToString(evaluateHand([c('A'), c('K')]))).toBe('BJ')
    expect(handValueToString(evaluateHand([c('A'), c('6')]))).toBe('S17')
    expect(handValueToString(evaluateHand([c('T'), c('7')]))).toBe('17')
    expect(handValueToString(evaluateHand([c('T'), c('8'), c('6')]))).toContain('BUST')
  })
})
