import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { uploadAudio } from './api'

export type RecordingMode = 'mic' | 'mic+system'

export const supportsSystemAudio =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

interface RecordingState {
  /** The meeting note ID currently being recorded */
  noteId: number | null
  isRecording: boolean
  duration: number
  error: string | null
  /** True while the blob is being uploaded after stop */
  isUploading: boolean
}

interface RecordingContextValue extends RecordingState {
  start: (noteId: number, mode: RecordingMode) => Promise<void>
  stop: () => Promise<void>
}

const RecordingContext = createContext<RecordingContextValue | null>(null)

export function useRecording() {
  const ctx = useContext(RecordingContext)
  if (!ctx) throw new Error('useRecording must be used within RecordingProvider')
  return ctx
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const [state, setState] = useState<RecordingState>({
    noteId: null,
    isRecording: false,
    duration: 0,
    error: null,
    isUploading: false,
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const noteIdRef = useRef<number | null>(null)
  const mimeTypeRef = useRef<string>('audio/webm')

  const stopStreams = useCallback(() => {
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

  const uploadAndFinalize = useCallback(
    async (blob: Blob, targetNoteId: number) => {
      if (blob.size === 0) return
      setState((s) => ({ ...s, isUploading: true }))
      try {
        await uploadAudio(targetNoteId, blob)
        queryClient.invalidateQueries({ queryKey: ['meeting-note', targetNoteId] })
      } catch (err) {
        console.error('Failed to upload recording:', err)
        setState((s) => ({
          ...s,
          error: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }))
      } finally {
        setState((s) => ({ ...s, isUploading: false }))
      }
    },
    [queryClient],
  )

  /** Stops the MediaRecorder and uploads the result. */
  const stopAndUpload = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      const targetNoteId = noteIdRef.current

      if (!recorder || recorder.state !== 'recording' || targetNoteId == null) {
        // Nothing to stop — just clean up
        stopStreams()
        setState((s) => ({ ...s, isRecording: false, noteId: null }))
        mediaRecorderRef.current = null
        noteIdRef.current = null
        resolve()
        return
      }

      recorder.onstop = async () => {
        stopStreams()
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
        chunksRef.current = []
        mediaRecorderRef.current = null

        setState((s) => ({ ...s, isRecording: false, noteId: null }))

        await uploadAndFinalize(blob, targetNoteId)
        noteIdRef.current = null
        resolve()
      }

      recorder.stop()
    })
  }, [stopStreams, uploadAndFinalize])

  const start = useCallback(
    async (noteId: number, mode: RecordingMode) => {
      // If already recording, stop first
      if (mediaRecorderRef.current?.state === 'recording') {
        await stopAndUpload()
      }

      setState({ noteId, isRecording: false, duration: 0, error: null, isUploading: false })
      noteIdRef.current = noteId
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

          for (const track of displayStream.getVideoTracks()) {
            track.stop()
          }

          const audioTracks = displayStream.getAudioTracks()
          if (audioTracks.length === 0) {
            stopStreams()
            setState((s) => ({
              ...s,
              noteId: null,
              error:
                'No system audio captured. Make sure to check "Share audio" when sharing your screen.',
            }))
            return
          }

          const ctx = new AudioContext()
          const dest = ctx.createMediaStreamDestination()
          ctx.createMediaStreamSource(micStream).connect(dest)
          ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(dest)
          recordStream = dest.stream

          displayStream.getAudioTracks().forEach((track) => {
            track.addEventListener('ended', () => {
              if (mediaRecorderRef.current?.state === 'recording') {
                stopAndUpload()
              }
            })
          })
        } else {
          recordStream = micStream
        }

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
        mimeTypeRef.current = mimeType

        const recorder = new MediaRecorder(recordStream, { mimeType })
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data)
          }
        }

        recorder.start(1000)
        setState((s) => ({ ...s, isRecording: true }))

        timerRef.current = setInterval(() => {
          setState((s) => ({ ...s, duration: s.duration + 1 }))
        }, 1000)
      } catch (err) {
        stopStreams()
        noteIdRef.current = null
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setState((s) => ({ ...s, noteId: null, error: 'Microphone permission denied.' }))
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          setState((s) => ({ ...s, noteId: null, error: null }))
        } else {
          setState((s) => ({
            ...s,
            noteId: null,
            error: `Recording failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          }))
        }
      }
    },
    [stopAndUpload, stopStreams],
  )

  const stop = useCallback(async () => {
    await stopAndUpload()
  }, [stopAndUpload])

  // Handle page visibility change (computer sleep, tab hidden for long time)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return // going hidden is fine, we keep recording

      // Coming back visible — check if the recorder died while we were away
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'recording' && noteIdRef.current != null) {
        // Recorder was terminated (e.g. OS reclaimed resources during sleep)
        stopStreams()
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
        chunksRef.current = []
        mediaRecorderRef.current = null

        const targetNoteId = noteIdRef.current
        noteIdRef.current = null
        setState((s) => ({ ...s, isRecording: false, noteId: null }))

        if (blob.size > 0) {
          uploadAndFinalize(blob, targetNoteId)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [stopStreams, uploadAndFinalize])

  // Handle beforeunload — stop recording and upload synchronously via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!mediaRecorderRef.current || noteIdRef.current == null) return

      // Warn the user they have an active recording
      e.preventDefault()

      // Try to finalize what we have
      const recorder = mediaRecorderRef.current
      if (recorder.state === 'recording') {
        recorder.stop()
      }
      stopStreams()

      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
      if (blob.size > 0) {
        const formData = new FormData()
        formData.append('file', blob, 'recording.webm')
        navigator.sendBeacon(`/api/meeting-notes/${noteIdRef.current}/audio`, formData)
      }

      chunksRef.current = []
      mediaRecorderRef.current = null
      noteIdRef.current = null
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [stopStreams])

  return (
    <RecordingContext.Provider
      value={{
        ...state,
        start,
        stop,
      }}
    >
      {children}
    </RecordingContext.Provider>
  )
}
