'use client'

import { useState } from 'react'
import { CameraFeed } from '@/components/CameraFeed'
import { GameOverlay } from '@/components/GameOverlay'
import { ManualInput } from '@/components/ManualInput'
import { CalibrationView } from '@/components/CalibrationView'
import { useGameStore } from '@/lib/sessionStore'
import Link from 'next/link'

type ViewMode = 'camera' | 'manual'

export default function Home() {
  const [mode, setMode] = useState<ViewMode>('manual')
  const [showCalibration, setShowCalibration] = useState(false)
  const calibration = useGameStore(s => s.calibration)
  const resetHand = useGameStore(s => s.resetHand)

  const handleCameraMode = () => {
    if (!calibration) {
      setShowCalibration(true)
    }
    setMode('camera')
  }

  return (
    <main className="h-screen w-screen relative overflow-hidden">
      {mode === 'camera' ? (
        <>
          <CameraFeed />
          <GameOverlay />
        </>
      ) : (
        <ManualInput />
      )}

      {/* Calibration overlay */}
      {showCalibration && (
        <CalibrationView onComplete={() => setShowCalibration(false)} />
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-0 right-0 z-50 flex justify-center gap-3 px-4">
        <button
          onClick={() => mode === 'camera' ? setMode('manual') : handleCameraMode()}
          className="bg-white/20 backdrop-blur px-3 py-2 rounded-lg text-sm"
        >
          {mode === 'camera' ? 'Manual' : 'Camera'}
        </button>

        {mode === 'camera' && (
          <button
            onClick={() => setShowCalibration(true)}
            className="bg-white/20 backdrop-blur px-3 py-2 rounded-lg text-sm"
          >
            Calibrate
          </button>
        )}

        <button
          onClick={resetHand}
          className="bg-white/20 backdrop-blur px-3 py-2 rounded-lg text-sm"
        >
          Reset Hand
        </button>

        <Link
          href="/stats"
          className="bg-white/20 backdrop-blur px-3 py-2 rounded-lg text-sm"
        >
          Stats
        </Link>
      </div>
    </main>
  )
}
