export type Suit = 'h' | 'd' | 'c' | 's'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  rank: Rank
  suit: Suit
}

export type Action = 'H' | 'S' | 'D' | 'P'
export type StrategyAction = 'H' | 'S' | 'D' | 'P' | 'Dh' | 'Ds' | 'Ph'

export interface HandValue {
  hard: number
  soft: number | null // null if no ace or same as hard
  isSoft: boolean
  best: number // best value <= 21, or lowest bust value
  isBust: boolean
  isBlackjack: boolean
}

export interface Detection {
  card: Card
  bbox: [number, number, number, number] // x, y, w, h (normalized 0-1)
  confidence: number
}

export type GamePhase = 'idle' | 'dealing' | 'player_turn' | 'dealer_turn' | 'settlement'

export interface Decision {
  playerCards: Card[]
  dealerUpcard: Card
  action: Action
  correctAction: Action
  isCorrect: boolean
  handIndex: number
}

export interface SessionStats {
  handsPlayed: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  totalDecisions: number
  correctDecisions: number
  errors: Decision[]
}

export interface Zone {
  x: number
  y: number
  width: number
  height: number
}

export interface CalibrationData {
  dealerZone: Zone
  playerZone: Zone
}
