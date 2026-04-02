import { useState, useRef, useCallback, useEffect } from 'react'

export type RecordingMode = 'mic' | 'mic+system'

interface UseAudioRecorderReturn {
  isRecording: boolean
  duration: number
  error: string | null
  start: (mode: RecordingMode) => Promise<void>
  stop: () => Promise<Blob>
}

export const supportsSystemAudio = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolveStopRef = useRef<((blob: Blob) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    streamsRef.current = []
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const start = useCallback(async (mode: RecordingMode) => {
    setError(null)
    setDuration(0)
    chunksRef.current = []

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamsRef.current.push(micStream)

      let recordStream: MediaStream

      if (mode === 'mic+system') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        streamsRef.current.push(displayStream)

        // Stop the video track immediately — we only want audio
        for (const track of displayStream.getVideoTracks()) {
          track.stop()
        }

        const audioTracks = displayStream.getAudioTracks()
        if (audioTracks.length === 0) {
          cleanup()
          setError('No system audio captured. Make sure to check "Share audio" when sharing your screen.')
          return
        }

        // Mix mic + system audio via Web Audio API
        const ctx = new AudioContext()
        const dest = ctx.createMediaStreamDestination()
        ctx.createMediaStreamSource(micStream).connect(dest)
        ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest)
        recordStream = dest.stream

        // Stop recording if the user stops screen sharing
        displayStream.getAudioTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
          })
        })
      } else {
        recordStream = micStream
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(recordStream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        cleanup()
        setIsRecording(false)
        const blob = new Blob(chunksRef.current, { type: mimeType })
        resolveStopRef.current?.(blob)
        resolveStopRef.current = null
      }

      recorder.start(1000) // collect data every second
      setIsRecording(true)

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch (err) {
      cleanup()
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone permission denied.')
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled the screen share picker — not an error
        setError(null)
      } else {
        setError(`Recording failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
  }, [cleanup])

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      resolveStopRef.current = resolve
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      } else {
        cleanup()
        setIsRecording(false)
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
      }
    })
  }, [cleanup])

  return { isRecording, duration, error, start, stop }
}
