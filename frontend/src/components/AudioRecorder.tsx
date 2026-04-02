import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Mic, Square, Monitor, Loader2 } from 'lucide-react'
import { useAudioRecorder, supportsSystemAudio, type RecordingMode } from '../hooks/useAudioRecorder'
import { uploadAudio } from '../api'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioRecorder({ noteId }: { noteId: number }) {
  const queryClient = useQueryClient()
  const { isRecording, duration, error, start, stop } = useAudioRecorder()
  const [mode, setMode] = useState<RecordingMode>('mic')

  const uploadMutation = useMutation({
    mutationFn: (blob: Blob) => uploadAudio(noteId, blob),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-note', noteId] })
    },
  })

  const handleStart = () => start(mode)

  const handleStop = async () => {
    const blob = await stop()
    if (blob.size > 0) {
      uploadMutation.mutate(blob)
    }
  }

  return (
    <div className="space-y-2">
      {!isRecording ? (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStart}
              disabled={uploadMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              {uploadMutation.isPending ? (
                <><Loader2 size={12} className="animate-spin" /> Uploading...</>
              ) : (
                <><Mic size={12} /> Record</>
              )}
            </button>
            {supportsSystemAudio && (
              <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mode === 'mic+system'}
                  onChange={(e) => setMode(e.target.checked ? 'mic+system' : 'mic')}
                  className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 h-3 w-3"
                />
                <Monitor size={10} />
                System audio
              </label>
            )}
          </div>
          {mode === 'mic+system' && !isRecording && (
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-tight">
              Your browser will ask you to share a screen. Check "Share audio" to capture meeting audio.
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-xs font-mono text-red-600 dark:text-red-400">{formatDuration(duration)}</span>
          <button
            onClick={handleStop}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Square size={10} /> Stop
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
