'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

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
          videoRef.current.onloadedmetadata = () => {
            setIsReady(true)
          }
        }
      } catch (err) {
        console.error('Camera error:', err)
        setError('Camera access denied. Please allow camera permissions.')
      }
    }

    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  // Capture frames for detection (will be connected to detector later)
  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !isReady) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }, [isReady])

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
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <p className="text-gray-400 animate-pulse">Starting camera...</p>
        </div>
      )}
    </>
  )
}
