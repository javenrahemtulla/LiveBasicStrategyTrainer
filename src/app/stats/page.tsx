'use client'

import { useEffect, useState } from 'react'
import { getSessions, getLifetimeStats, SessionRecord } from '@/lib/historyStore'
import Link from 'next/link'

export default function StatsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [lifetime, setLifetime] = useState<Awaited<ReturnType<typeof getLifetimeStats>> | null>(null)

  useEffect(() => {
    async function load() {
      const [s, l] = await Promise.all([getSessions(20), getLifetimeStats()])
      setSessions(s)
      setLifetime(l)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Stats</h1>
        <Link href="/" className="text-blue-400 text-sm">Back</Link>
      </div>

      {/* Lifetime stats */}
      {lifetime && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard label="Total Hands" value={lifetime.totalHands} />
          <StatCard label="Win Rate" value={lifetime.totalHands > 0
            ? `${Math.round((lifetime.totalWins / lifetime.totalHands) * 100)}%`
            : '-'
          } />
          <StatCard label="Strategy Accuracy" value={`${lifetime.accuracy}%`}
            color={lifetime.accuracy >= 90 ? 'text-green-400' : lifetime.accuracy >= 70 ? 'text-yellow-400' : 'text-red-400'}
          />
          <StatCard label="W/L/P" value={`${lifetime.totalWins}/${lifetime.totalLosses}/${lifetime.totalPushes}`} />
          <StatCard label="Total Decisions" value={lifetime.totalDecisions} />
          <StatCard label="Correct" value={lifetime.correctDecisions} />
        </div>
      )}

      {/* Session history */}
      <h2 className="text-lg font-semibold mb-3">Recent Sessions</h2>
      {sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions yet. Play some hands!</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => {
            const accuracy = s.stats.totalDecisions > 0
              ? Math.round((s.stats.correctDecisions / s.stats.totalDecisions) * 100)
              : 100
            return (
              <div key={s.id} className="bg-gray-900 rounded-lg p-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">
                    {new Date(s.startTime).toLocaleDateString()} {new Date(s.startTime).toLocaleTimeString()}
                  </span>
                  <span className={accuracy >= 90 ? 'text-green-400' : 'text-yellow-400'}>
                    {accuracy}% accuracy
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>{s.stats.handsPlayed} hands</span>
                  <span className="text-green-400">W:{s.stats.wins}</span>
                  <span className="text-red-400">L:{s.stats.losses}</span>
                  <span className="text-yellow-400">P:{s.stats.pushes}</span>
                  <span>{s.stats.errors.length} errors</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-500 uppercase">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  )
}
