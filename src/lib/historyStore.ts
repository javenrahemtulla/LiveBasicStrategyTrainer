import { openDB, IDBPDatabase } from 'idb'
import { SessionStats, Decision } from './types'

const DB_NAME = 'bj-trainer'
const DB_VERSION = 1
const SESSIONS_STORE = 'sessions'

export interface SessionRecord {
  id: string
  startTime: number
  endTime: number
  stats: SessionStats
}

let db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
        store.createIndex('startTime', 'startTime')
      }
    },
  })

  return db
}

export async function saveSession(stats: SessionStats): Promise<string> {
  const database = await getDB()
  const id = `session_${Date.now()}`
  const record: SessionRecord = {
    id,
    startTime: Date.now(),
    endTime: Date.now(),
    stats,
  }
  await database.put(SESSIONS_STORE, record)
  return id
}

export async function getSessions(limit = 50): Promise<SessionRecord[]> {
  const database = await getDB()
  const all = await database.getAllFromIndex(SESSIONS_STORE, 'startTime')
  return all.reverse().slice(0, limit)
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  const database = await getDB()
  return database.get(SESSIONS_STORE, id)
}

export async function deleteSession(id: string): Promise<void> {
  const database = await getDB()
  await database.delete(SESSIONS_STORE, id)
}

export async function getLifetimeStats(): Promise<{
  totalHands: number
  totalWins: number
  totalLosses: number
  totalPushes: number
  totalDecisions: number
  correctDecisions: number
  accuracy: number
}> {
  const sessions = await getSessions(1000)
  let totalHands = 0
  let totalWins = 0
  let totalLosses = 0
  let totalPushes = 0
  let totalDecisions = 0
  let correctDecisions = 0

  for (const s of sessions) {
    totalHands += s.stats.handsPlayed
    totalWins += s.stats.wins
    totalLosses += s.stats.losses
    totalPushes += s.stats.pushes
    totalDecisions += s.stats.totalDecisions
    correctDecisions += s.stats.correctDecisions
  }

  return {
    totalHands,
    totalWins,
    totalLosses,
    totalPushes,
    totalDecisions,
    correctDecisions,
    accuracy: totalDecisions > 0 ? Math.round((correctDecisions / totalDecisions) * 100) : 100,
  }
}
