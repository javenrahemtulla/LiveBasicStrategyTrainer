'use client'

import { useGameStore } from '@/lib/sessionStore'
import { evaluateHand, handValueToString, cardToString } from '@/lib/handEvaluator'

export function GameOverlay() {
  const { phase, playerHands, activeHandIndex, dealerHand, stats, lastFeedback } = useGameStore()

  const accuracy = stats.totalDecisions > 0
    ? Math.round((stats.correctDecisions / stats.totalDecisions) * 100)
    : 100

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Top stats bar */}
      <div className="flex justify-between items-center p-2 bg-black/60 backdrop-blur-sm pointer-events-auto">
        <div className="flex gap-3 text-xs">
          <span className="text-green-400">W:{stats.wins}</span>
          <span className="text-red-400">L:{stats.losses}</span>
          <span className="text-yellow-400">P:{stats.pushes}</span>
        </div>
        <div className="text-xs">
          <span className="text-gray-400">Hands: {stats.handsPlayed}</span>
        </div>
        <div className="text-xs">
          <span className={accuracy >= 90 ? 'text-green-400' : accuracy >= 70 ? 'text-yellow-400' : 'text-red-400'}>
            Strategy: {accuracy}%
          </span>
        </div>
      </div>

      {/* Dealer hand display */}
      {dealerHand.length > 0 && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-black/50 rounded-lg px-3 py-1">
          <div className="text-xs text-gray-400 text-center">Dealer</div>
          <div className="flex gap-1 justify-center">
            {dealerHand.map((c, i) => (
              <span key={i} className="text-sm font-mono text-white">{cardToString(c)}</span>
            ))}
          </div>
          <div className="text-center text-sm font-bold text-white">
            {handValueToString(evaluateHand(dealerHand))}
          </div>
        </div>
      )}

      {/* Player hand(s) display */}
      {playerHands.some(h => h.length > 0) && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-4">
          {playerHands.map((hand, i) => (
            hand.length > 0 && (
              <div
                key={i}
                className={`bg-black/50 rounded-lg px-3 py-1 ${
                  i === activeHandIndex && phase === 'player_turn' ? 'ring-2 ring-yellow-400' : ''
                }`}
              >
                <div className="text-xs text-gray-400 text-center">
                  Player{playerHands.length > 1 ? ` ${i + 1}` : ''}
                </div>
                <div className="flex gap-1 justify-center">
                  {hand.map((c, j) => (
                    <span key={j} className="text-sm font-mono text-white">{cardToString(c)}</span>
                  ))}
                </div>
                <div className="text-center text-sm font-bold text-white">
                  {handValueToString(evaluateHand(hand))}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Strategy feedback flash */}
      {lastFeedback && (
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          px-6 py-3 rounded-xl text-lg font-bold backdrop-blur-sm
          ${lastFeedback.correct ? 'bg-green-500/70 text-white' : 'bg-red-500/70 text-white'}
          animate-pulse`}
        >
          {lastFeedback.message}
        </div>
      )}

      {/* Phase indicator */}
      {phase !== 'idle' && (
        <div className="absolute bottom-2 left-2 text-xs text-gray-500 uppercase">
          {phase.replace('_', ' ')}
        </div>
      )}
    </div>
  )
}
