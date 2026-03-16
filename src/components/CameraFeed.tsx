'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { detectCards, DETECT_FPS } from '@/lib/cardDetector'
import { mapDetections } from '@/lib/spatialMapper'
import { GameStateMachine, GameEvent } from '@/lib/gameStateMachine'
import { useGameStore } from '@/lib/sessionStore'
import { Detection } from '@/lib/types'

export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [statusText, setStatusText] = useState('Starting camera...')
  const stateMachineRef = useRef<GameStateMachine | null>(null)

  const {
    setDetections,
    setPhase,
    startHand,
    recordDecision,
    setFeedback,
    settleHand,
    calibration,
    resetHand,
  } = useGameStore()

  // Set up game state machine
  useEffect(() => {
    const machine = new GameStateMachine((event: GameEvent) => {
      const data = event.data as Record<string, unknown> | undefined

      switch (event.type) {
        case 'hand_started':
          if (data?.playerCards && data?.dealerUpcard) {
            startHand(
              data.playerCards as import('@/lib/types').Card[],
              data.dealerUpcard as import('@/lib/types').Card
            )
          }
          break

        case 'strategy_feedback':
          if (data?.decision) {
            const decision = data.decision as import('@/lib/types').Decision
            recordDecision(decision)
            setFeedback({
              correct: decision.isCorrect,
              message: data.message as string,
            })
            setTimeout(() => setFeedback(null), 3000)
          } else if (data?.hint) {
            setFeedback({
              correct: true,
              message: `Basic strategy: ${data.hint}`,
            })
          }
          break

        case 'hand_settled':
          if (data?.result && data.result !== 'cleared') {
            settleHand(data.result as 'win' | 'loss' | 'push' | 'blackjack')
          } else {
            resetHand()
          }
          break

        case 'player_action':
          setPhase('player_turn')
          break

        case 'dealer_action':
          setPhase('dealer_turn')
          break
      }
    })

    stateMachineRef.current = machine
    return () => { stateMachineRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setIsReady(true)
        }
      } catch (err) {
        console.error('Camera error:', err)
        setError('Camera access denied. Please allow camera permissions.')
      }
    }

    startCamera()
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Capture a frame from the video
  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !isReady) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Downscale for faster processing
    const scale = Math.min(1, 480 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }, [isReady])

  // Detection loop — runs pure CV on each frame
  useEffect(() => {
    if (!isReady) return

    let running = true
    const intervalMs = Math.round(1000 / DETECT_FPS)

    function tick() {
      if (!running) return

      const frame = captureFrame()
      if (frame) {
        try {
          const detections = detectCards(frame)
          setDetections(detections)
          setStatusText(
            detections.length > 0
              ? `${detections.length} card${detections.length !== 1 ? 's' : ''} detected`
              : 'No cards detected'
          )

          // Feed through spatial mapper → game state machine
          if (stateMachineRef.current) {
            const mapped = mapDetections(detections, calibration)
            stateMachineRef.current.processDetections(mapped)
          }
        } catch (err) {
          console.error('Detection error:', err)
          setStatusText('Detection error')
        }
      }

      setTimeout(tick, intervalMs)
    }

    tick()
    return () => { running = false }
  }, [isReady, captureFrame, setDetections, calibration])

  const detections = useGameStore(s => s.detections)

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 p-8">
        <p className="text-red-400 text-center">{error}</p>
      </div>
    )
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Detection status */}
      {isReady && (
        <div className="absolute top-12 right-2 z-20">
          <div className="px-2 py-1 rounded text-xs backdrop-blur-sm bg-black/60 text-gray-300">
            {statusText}
          </div>
        </div>
      )}

      {/* Bounding boxes overlay */}
      {detections.length > 0 && (
        <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none">
          {detections.map((det: Detection, i: number) => (
            <g key={i}>
              <rect
                x={`${det.bbox[0] * 100}%`}
                y={`${det.bbox[1] * 100}%`}
                width={`${det.bbox[2] * 100}%`}
                height={`${det.bbox[3] * 100}%`}
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                rx="4"
              />
              <text
                x={`${det.bbox[0] * 100}%`}
                y={`${det.bbox[1] * 100 - 0.5}%`}
                fill="#22c55e"
                fontSize="14"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {det.card.rank}{det.card.suit} ({Math.round(det.confidence * 100)}%)
              </text>
            </g>
          ))}
        </svg>
      )}

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <p className="text-gray-400 animate-pulse">Starting camera...</p>
        </div>
      )}
    </>
  )
}
