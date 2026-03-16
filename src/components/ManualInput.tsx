'use client'

import { useState } from 'react'
import { Card, Rank, Suit, Action } from '@/lib/types'
import { getCorrectAction, actionName } from '@/lib/basicStrategy'
import { evaluateHand, handValueToString, cardToString } from '@/lib/handEvaluator'
import { useGameStore } from '@/lib/sessionStore'

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
const SUIT: Suit = 'h' // suit doesn't matter for strategy

type InputStep = 'dealer' | 'player' | 'play'

interface Props {
  onSwitchToCamera: () => void
}

export function ManualInput({ onSwitchToCamera }: Props) {
  const [step, setStep] = useState<InputStep>('dealer')
  const [dealerUpcard, setDealerUpcard] = useState<Card | null>(null)
  const [playerCards, setPlayerCards] = useState<Card[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackCorrect, setFeedbackCorrect] = useState(true)
  const { stats, recordDecision } = useGameStore()

  const accuracy = stats.totalDecisions > 0
    ? Math.round((stats.correctDecisions / stats.totalDecisions) * 100)
    : 100

  function selectCard(rank: Rank) {
    const card: Card = { rank, suit: SUIT }

    if (step === 'dealer') {
      setDealerUpcard(card)
      setStep('player')
    } else if (step === 'player') {
      const updated = [...playerCards, card]
      setPlayerCards(updated)
      if (updated.length >= 2) {
        setStep('play')
      }
    }
  }

  function makePlay(action: Action) {
    if (!dealerUpcard) return

    const correct = getCorrectAction({ playerCards, dealerUpcard })
    const isCorrect = action === correct

    recordDecision({
      playerCards: [...playerCards],
      dealerUpcard,
      action,
      correctAction: correct,
      isCorrect,
      handIndex: 0,
    })

    if (isCorrect) {
      setFeedback('Correct!')
      setFeedbackCorrect(true)
    } else {
      setFeedback(`Wrong! Should ${actionName(correct)}`)
      setFeedbackCorrect(false)
    }

    // Handle the action
    if (action === 'H') {
      // Show feedback briefly, then allow next card
      setTimeout(() => {
        setFeedback(null)
        setStep('player')
      }, 1500)
    } else {
      // Stand, Double, Split - hand is done
      setTimeout(() => {
        reset()
      }, 2000)
    }
  }

  function reset() {
    setStep('dealer')
    setDealerUpcard(null)
    setPlayerCards([])
    setFeedback(null)
  }

  const hand = evaluateHand(playerCards)
  const canDouble = playerCards.length === 2
  const canSplit = playerCards.length === 2 && playerCards[0].rank === playerCards[1].rank

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Stats bar */}
      <div className="shrink-0 flex justify-between items-center px-4 pt-3 pb-2 text-sm">
        <div className="flex gap-3">
          <span className="text-green-400">W:{stats.wins}</span>
          <span className="text-red-400">L:{stats.losses}</span>
        </div>
        <span className="text-gray-400">{stats.totalDecisions} decisions</span>
        <span className={accuracy >= 90 ? 'text-green-400' : accuracy >= 70 ? 'text-yellow-400' : 'text-red-400'}>
          {accuracy}% accuracy
        </span>
      </div>

      {/* Current hand display */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 px-4">
        {/* Dealer */}
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase mb-1">Dealer Shows</div>
          {dealerUpcard ? (
            <div className="text-3xl font-bold">{cardToString(dealerUpcard)}</div>
          ) : (
            <div className="text-3xl text-gray-700">?</div>
          )}
        </div>

        {/* Player */}
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase mb-1">Your Hand</div>
          <div className="flex gap-2 justify-center">
            {playerCards.length > 0 ? (
              playerCards.map((c, i) => (
                <span key={i} className="text-2xl font-bold">{cardToString(c)}</span>
              ))
            ) : (
              <span className="text-2xl text-gray-700">? ?</span>
            )}
          </div>
          {playerCards.length > 0 && (
            <div className="text-lg text-gray-400 mt-1">{handValueToString(hand)}</div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`text-xl font-bold px-6 py-2 rounded-lg ${
            feedbackCorrect ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {feedback}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-2">
        {step === 'play' ? (
          <div className="space-y-2">
            <div className="text-center text-xs text-gray-500">What do you do?</div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => makePlay('H')} className="bg-blue-600 hover:bg-blue-500 rounded-lg py-3 font-bold text-sm">
                Hit
              </button>
              <button onClick={() => makePlay('S')} className="bg-red-600 hover:bg-red-500 rounded-lg py-3 font-bold text-sm">
                Stand
              </button>
              <button
                onClick={() => makePlay('D')}
                disabled={!canDouble}
                className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg py-3 font-bold text-sm"
              >
                Double
              </button>
              <button
                onClick={() => makePlay('P')}
                disabled={!canSplit}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg py-3 font-bold text-sm"
              >
                Split
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-center text-xs text-gray-500">
              {step === 'dealer' ? 'Select dealer upcard' : `Select player card ${playerCards.length + 1}`}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {RANKS.map(rank => (
                <button
                  key={rank}
                  onClick={() => selectCard(rank)}
                  className="bg-white/10 hover:bg-white/20 rounded-lg py-3 font-bold text-sm"
                >
                  {rank}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav bar */}
      <div className="shrink-0 flex justify-center gap-3 px-4 py-3 border-t border-gray-800">
        <button
          onClick={onSwitchToCamera}
          className="bg-white/10 px-3 py-2 rounded-lg text-sm"
        >
          Camera
        </button>
        <button
          onClick={reset}
          className="bg-white/10 px-3 py-2 rounded-lg text-sm"
        >
          Reset Hand
        </button>
        <a
          href="/stats"
          className="bg-white/10 px-3 py-2 rounded-lg text-sm"
        >
          Stats
        </a>
      </div>
    </div>
  )
}
