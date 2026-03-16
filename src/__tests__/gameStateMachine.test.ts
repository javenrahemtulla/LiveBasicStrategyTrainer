import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameStateMachine, GameEvent } from '@/lib/gameStateMachine'
import { MappedDetections } from '@/lib/spatialMapper'
import { Card, Detection } from '@/lib/types'

function c(rank: string, suit: string = 'h'): Card {
  return { rank: rank as Card['rank'], suit: suit as Card['suit'] }
}

function det(rank: string, suit: string = 'h', x = 0.5, y = 0.5): Detection {
  return {
    card: c(rank, suit),
    bbox: [x, y, 0.05, 0.07],
    confidence: 0.95,
  }
}

function mapped(dealer: Detection[], player: Detection[]): MappedDetections {
  return {
    dealerCards: dealer,
    playerCards: [player],
  }
}

describe('GameStateMachine', () => {
  let events: GameEvent[]
  let sm: GameStateMachine

  beforeEach(() => {
    events = []
    sm = new GameStateMachine((e) => events.push(e))
  })

  it('starts in idle phase', () => {
    expect(sm.getPhase()).toBe('idle')
  })

  it('transitions from idle to dealing when cards appear', () => {
    const t = 1000
    // First frame - cards appear, not yet stable
    sm.processDetections(mapped([det('7')], [det('T'), det('5')]), t)
    expect(sm.getPhase()).toBe('idle') // not stable yet

    // After stability period
    sm.processDetections(mapped([det('7')], [det('T'), det('5')]), t + 1100)
    expect(sm.getPhase()).not.toBe('idle')
  })

  it('detects initial deal and transitions to player turn', () => {
    const t = 1000
    sm.processDetections(mapped([det('7')], [det('T'), det('5')]), t)
    sm.processDetections(mapped([det('7')], [det('T'), det('5')]), t + 1100)

    // Should have started hand
    expect(sm.getPhase()).toBe('player_turn')
    expect(events.some(e => e.type === 'hand_started')).toBe(true)
  })

  it('detects blackjack and skips to dealer turn', () => {
    const t = 1000
    sm.processDetections(mapped([det('7')], [det('A'), det('K')]), t)
    sm.processDetections(mapped([det('7')], [det('A'), det('K')]), t + 1100)

    expect(sm.getPhase()).toBe('dealer_turn')
    const startEvent = events.find(e => e.type === 'hand_started')
    expect(startEvent?.data?.blackjack).toBe(true)
  })

  it('manual reset works', () => {
    const t = 1000
    sm.processDetections(mapped([det('7')], [det('T'), det('5')]), t)
    sm.processDetections(mapped([det('7')], [det('T'), det('5')]), t + 1100)
    expect(sm.getPhase()).toBe('player_turn')

    sm.reset()
    expect(sm.getPhase()).toBe('idle')
    expect(sm.getDealerCards()).toEqual([])
    expect(sm.getPlayerHands()).toEqual([[]])
  })
})
