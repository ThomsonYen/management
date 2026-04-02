import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FileText, Loader2, Sparkles } from 'lucide-react'
import { transcribeMeetingNote } from '../api'

interface TranscriptEditorProps {
  noteId: number
  transcript: string | null
  hasAudio: boolean
  onSave: (transcript: string) => void
}

export default function TranscriptEditor({ noteId, transcript, hasAudio, onSave }: TranscriptEditorProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(!!transcript)
  const [value, setValue] = useState(transcript ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestValueRef = useRef(value)

  // Sync from prop when it changes externally
  useEffect(() => {
    setValue(transcript ?? '')
    latestValueRef.current = transcript ?? ''
  }, [transcript])

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (latestValueRef.current !== (transcript ?? '')) {
      onSave(latestValueRef.current)
    }
  }, [onSave, transcript])

  // Flush on unmount
  useEffect(() => {
    return flush
  }, [flush])

  const handleChange = (newValue: string) => {
    setValue(newValue)
    latestValueRef.current = newValue
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSave(newValue)
    }, 1000)
  }

  const transcribeMutation = useMutation({
    mutationFn: () => transcribeMeetingNote(noteId),
    onSuccess: (data) => {
      setValue(data.transcript)
      latestValueRef.current = data.transcript
      setExpanded(true)
      queryClient.invalidateQueries({ queryKey: ['meeting-note', noteId] })
    },
  })

  const hasContent = !!transcript

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FileText size={14} />
          Transcript
          {!hasContent && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">(empty)</span>}
        </button>
        {hasAudio && (
          <button
            onClick={() => transcribeMutation.mutate()}
            disabled={transcribeMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 mr-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors disabled:opacity-50"
            title={hasContent ? 'Re-transcribe from audio' : 'Transcribe audio to text'}
          >
            {transcribeMutation.isPending ? (
              <><Loader2 size={12} className="animate-spin" /> Transcribing...</>
            ) : (
              <><Sparkles size={12} /> {hasContent ? 'Re-transcribe' : 'Transcribe'}</>
            )}
          </button>
        )}
      </div>
      {transcribeMutation.isError && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <span className="text-red-500 mt-0.5 flex-shrink-0">⚠</span>
          <span>
            {(transcribeMutation.error as Error)?.message?.includes('503')
              ? 'OpenAI API key not configured. Set keys.openai_key in project_config.yaml.'
              : `Transcription failed: ${(transcribeMutation.error as Error)?.message ?? 'Unknown error'}`}
          </span>
        </div>
      )}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={flush}
            placeholder="Paste or type transcript here..."
            className="w-full min-h-[200px] p-4 text-sm font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 resize-y focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
          />
        </div>
      )}
    </div>
  )
}
