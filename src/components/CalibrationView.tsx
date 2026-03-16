'use client'

import { useState, useRef, useCallback } from 'react'
import { Zone, CalibrationData } from '@/lib/types'
import { useGameStore } from '@/lib/sessionStore'

interface Props {
  onComplete: () => void
}

export function CalibrationView({ onComplete }: Props) {
  const setCalibration = useGameStore(s => s.setCalibration)
  const [step, setStep] = useState<'dealer' | 'player'>('dealer')
  const [dealerZone, setDealerZone] = useState<Zone | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [currentRect, setCurrentRect] = useState<Zone | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const getRelativePos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    }
  }, [])

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const pos = getRelativePos(e)
    setStartPos(pos)
    setDrawing(true)
    setCurrentRect({ x: pos.x, y: pos.y, width: 0, height: 0 })
  }, [getRelativePos])

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing || !startPos) return
    const pos = getRelativePos(e)
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    })
  }, [drawing, startPos, getRelativePos])

  const handleEnd = useCallback(() => {
    if (!currentRect || currentRect.width < 0.05 || currentRect.height < 0.05) {
      setDrawing(false)
      setCurrentRect(null)
      return
    }

    if (step === 'dealer') {
      setDealerZone(currentRect)
      setStep('player')
    } else if (dealerZone) {
      const calibration: CalibrationData = {
        dealerZone,
        playerZone: currentRect,
      }
      setCalibration(calibration)
      onComplete()
    }

    setDrawing(false)
    setCurrentRect(null)
    setStartPos(null)
  }, [currentRect, step, dealerZone, setCalibration, onComplete])

  function useDefaults() {
    setCalibration({
      dealerZone: { x: 0.1, y: 0.0, width: 0.8, height: 0.4 },
      playerZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.45 },
    })
    onComplete()
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex flex-col">
      <div className="p-4 text-center">
        <h2 className="text-lg font-bold mb-1">Calibrate Zones</h2>
        <p className="text-sm text-gray-400">
          {step === 'dealer'
            ? 'Draw a rectangle around the DEALER card area'
            : 'Draw a rectangle around the PLAYER card area'}
        </p>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative mx-4 border border-gray-600 rounded-lg"
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
      >
        {/* Dealer zone (if set) */}
        {dealerZone && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/20 rounded"
            style={{
              left: `${dealerZone.x * 100}%`,
              top: `${dealerZone.y * 100}%`,
              width: `${dealerZone.width * 100}%`,
              height: `${dealerZone.height * 100}%`,
            }}
          >
            <span className="absolute top-1 left-1 text-xs text-blue-400">Dealer</span>
          </div>
        )}

        {/* Current drawing rect */}
        {currentRect && (
          <div
            className={`absolute border-2 rounded ${
              step === 'dealer' ? 'border-blue-400 bg-blue-400/20' : 'border-green-400 bg-green-400/20'
            }`}
            style={{
              left: `${currentRect.x * 100}%`,
              top: `${currentRect.y * 100}%`,
              width: `${currentRect.width * 100}%`,
              height: `${currentRect.height * 100}%`,
            }}
          />
        )}
      </div>

      <div className="p-4 flex gap-3 justify-center">
        <button onClick={useDefaults} className="bg-gray-700 px-4 py-2 rounded-lg text-sm">
          Use Defaults
        </button>
        {step === 'player' && (
          <button onClick={() => { setStep('dealer'); setDealerZone(null) }} className="bg-gray-700 px-4 py-2 rounded-lg text-sm">
            Redo
          </button>
        )}
      </div>
    </div>
  )
}
