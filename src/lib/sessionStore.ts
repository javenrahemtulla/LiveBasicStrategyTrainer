import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Card, GamePhase, Decision, SessionStats, Detection, CalibrationData } from './types'
import { saveSession } from './historyStore'

interface GameState {
  // Game phase
  phase: GamePhase

  // Hands
  playerHands: Card[][]
  activeHandIndex: number
  dealerHand: Card[]
  dealerUpcard: Card | null

  // Decisions log for current hand
  currentDecisions: Decision[]

  // Session stats
  stats: SessionStats

  // Session tracking
  sessionStartTime: number

  // Detections from camera
  detections: Detection[]

  // Calibration
  calibration: CalibrationData | null

  // Strategy feedback
  lastFeedback: { correct: boolean; message: string } | null

  // Actions
  setPhase: (phase: GamePhase) => void
  setDetections: (detections: Detection[]) => void
  startHand: (playerCards: Card[], dealerUpcard: Card) => void
  playerHit: (card: Card) => void
  playerStand: () => void
  playerDouble: (card: Card) => void
  playerSplit: () => void
  dealerAddCard: (card: Card) => void
  settleHand: (result: 'win' | 'loss' | 'push' | 'blackjack') => void
  recordDecision: (decision: Decision) => void
  setFeedback: (feedback: { correct: boolean; message: string } | null) => void
  setCalibration: (cal: CalibrationData) => void
  resetHand: () => void
  resetSession: () => void
}

const initialStats: SessionStats = {
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  blackjacks: 0,
  totalDecisions: 0,
  correctDecisions: 0,
  errors: [],
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      phase: 'idle',
      playerHands: [[]],
      activeHandIndex: 0,
      dealerHand: [],
      dealerUpcard: null,
      currentDecisions: [],
      stats: { ...initialStats },
      sessionStartTime: Date.now(),
      detections: [],
      calibration: null,
      lastFeedback: null,

      setPhase: (phase) => set({ phase }),
      setDetections: (detections) => set({ detections }),

      startHand: (playerCards, dealerUpcard) => set({
        phase: 'player_turn',
        playerHands: [playerCards],
        activeHandIndex: 0,
        dealerHand: [dealerUpcard],
        dealerUpcard,
        currentDecisions: [],
        lastFeedback: null,
      }),

      playerHit: (card) => set((state) => {
        const hands = [...state.playerHands]
        hands[state.activeHandIndex] = [...hands[state.activeHandIndex], card]
        return { playerHands: hands }
      }),

      playerStand: () => set((state) => {
        const nextIndex = state.activeHandIndex + 1
        if (nextIndex < state.playerHands.length) {
          return { activeHandIndex: nextIndex }
        }
        return { phase: 'dealer_turn' }
      }),

      playerDouble: (card) => set((state) => {
        const hands = [...state.playerHands]
        hands[state.activeHandIndex] = [...hands[state.activeHandIndex], card]
        const nextIndex = state.activeHandIndex + 1
        if (nextIndex < state.playerHands.length) {
          return { playerHands: hands, activeHandIndex: nextIndex }
        }
        return { playerHands: hands, phase: 'dealer_turn' }
      }),

      playerSplit: () => set((state) => {
        const currentHand = state.playerHands[state.activeHandIndex]
        if (currentHand.length !== 2) return state
        const hands = [...state.playerHands]
        hands.splice(state.activeHandIndex, 1, [currentHand[0]], [currentHand[1]])
        return { playerHands: hands }
      }),

      dealerAddCard: (card) => set((state) => ({
        dealerHand: [...state.dealerHand, card],
      })),

      settleHand: (result) => set((state) => {
        const stats = { ...state.stats }
        stats.handsPlayed++
        if (result === 'win') stats.wins++
        else if (result === 'loss') stats.losses++
        else if (result === 'push') stats.pushes++
        else if (result === 'blackjack') { stats.blackjacks++; stats.wins++ }
        return { phase: 'settlement', stats }
      }),

      recordDecision: (decision) => set((state) => {
        const stats = { ...state.stats }
        stats.totalDecisions++
        if (decision.isCorrect) stats.correctDecisions++
        else stats.errors = [...stats.errors, decision]
        return {
          currentDecisions: [...state.currentDecisions, decision],
          stats,
        }
      }),

      setFeedback: (lastFeedback) => set({ lastFeedback }),
      setCalibration: (calibration) => set({ calibration }),

      resetHand: () => set({
        phase: 'idle',
        playerHands: [[]],
        activeHandIndex: 0,
        dealerHand: [],
        dealerUpcard: null,
        currentDecisions: [],
        lastFeedback: null,
      }),

      resetSession: () => {
        // Save the current session to history before resetting
        const { stats, sessionStartTime } = get()
        if (stats.totalDecisions > 0) {
          saveSession(stats).catch(() => {})
        }
        set({
          phase: 'idle',
          playerHands: [[]],
          activeHandIndex: 0,
          dealerHand: [],
          dealerUpcard: null,
          currentDecisions: [],
          stats: { ...initialStats },
          sessionStartTime: Date.now(),
          lastFeedback: null,
        })
      },
    }),
    {
      name: 'bj-trainer-session',
      partialize: (state) => ({
        // Only persist stats and session metadata — not ephemeral UI state
        stats: state.stats,
        sessionStartTime: state.sessionStartTime,
        calibration: state.calibration,
      }),
    }
  )
)

// Auto-save the current session to IndexedDB history when the page unloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { stats, sessionStartTime } = useGameStore.getState()
    if (stats.totalDecisions > 0) {
      // Use sendBeacon-friendly approach: save synchronously to localStorage
      // and let the next page load flush it to IndexedDB
      const pendingSession = {
        id: `session_${sessionStartTime}`,
        startTime: sessionStartTime,
        endTime: Date.now(),
        stats,
      }
      try {
        const existing = localStorage.getItem('bj-trainer-pending-sessions')
        const pending = existing ? JSON.parse(existing) : []
        // Avoid duplicates by session id
        if (!pending.some((s: { id: string }) => s.id === pendingSession.id)) {
          pending.push(pendingSession)
        }
        localStorage.setItem('bj-trainer-pending-sessions', JSON.stringify(pending))
      } catch {
        // Storage full or unavailable — silently fail
      }
    }
  })
}

// Flush any pending sessions from localStorage to IndexedDB on load
export async function flushPendingSessions(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('bj-trainer-pending-sessions')
    if (!raw) return
    const pending = JSON.parse(raw)
    if (!Array.isArray(pending) || pending.length === 0) return

    const { openDB } = await import('idb')
    const db = await openDB('bj-trainer', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('sessions')) {
          const store = database.createObjectStore('sessions', { keyPath: 'id' })
          store.createIndex('startTime', 'startTime')
        }
      },
    })

    for (const session of pending) {
      await db.put('sessions', session)
    }

    localStorage.removeItem('bj-trainer-pending-sessions')
  } catch {
    // Silently fail
  }
}
