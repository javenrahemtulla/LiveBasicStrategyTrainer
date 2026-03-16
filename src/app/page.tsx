'use client'

import { useState, useEffect } from 'react'
import { CameraFeed } from '@/components/CameraFeed'
import { GameOverlay } from '@/components/GameOverlay'
import { ManualInput } from '@/components/ManualInput'
import { CalibrationView } from '@/components/CalibrationView'
import { useGameStore, flushPendingSessions } from '@/lib/sessionStore'
import Link from 'next/link'

type ViewMode = 'camera' | 'manual'

export default function Home() {
  const [mode, setMode] = useState<ViewMode>('manual')
  const [showCalibration, setShowCalibration] = useState(false)
  const calibration = useGameStore(s => s.calibration)
  const resetHand = useGameStore(s => s.resetHand)

  // Flush any sessions saved during previous page unload into IndexedDB
  useEffect(() => {
    flushPendingSessions()
  }, [])

  const handleCameraMode = () => {
    if (!calibration) {
      setShowCalibration(true)
    }
    setMode('camera')
  }

  return (
    <main className="h-[100dvh] w-screen relative overflow-hidden flex flex-col">
      {mode === 'camera' ? (
        <div className="flex-1 relative">
          <CameraFeed />
          <GameOverlay />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ManualInput
            onSwitchToCamera={handleCameraMode}
          />
        </div>
      )}

      {/* Calibration overlay */}
      {showCalibration && (
        <CalibrationView onComplete={() => setShowCalibration(false)} />
      )}

      {/* Bottom controls — only shown in camera mode */}
      {mode === 'camera' && (
        <div className="shrink-0 flex justify-center gap-3 px-4 py-3 bg-black/80 backdrop-blur">
          <button
            onClick={() => setMode('manual')}
            className="bg-white/20 px-3 py-2 rounded-lg text-sm"
          >
            Manual
          </button>
          <button
            onClick={() => setShowCalibration(true)}
            className="bg-white/20 px-3 py-2 rounded-lg text-sm"
          >
            Calibrate
          </button>
          <button
            onClick={resetHand}
            className="bg-white/20 px-3 py-2 rounded-lg text-sm"
          >
            Reset Hand
          </button>
          <Link
            href="/stats"
            className="bg-white/20 px-3 py-2 rounded-lg text-sm"
          >
            Stats
          </Link>
        </div>
      )}
    </main>
  )
}
