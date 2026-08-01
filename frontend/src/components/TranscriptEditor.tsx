import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FileText, Loader2, Sparkles } from 'lucide-react'
import { transcribeNote } from '../api'

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
 mutationFn: () => transcribeNote(noteId),
 onSuccess: (data) => {
 setValue(data.transcript)
 latestValueRef.current = data.transcript
 setExpanded(true)
 queryClient.invalidateQueries({ queryKey: ['note', noteId] })
 },
 })

 const hasContent = !!transcript

 return (
 <div className="border border-border rounded-lg overflow-hidden">
 <div className="flex items-center">
 <button
 onClick={() => setExpanded(!expanded)}
 className="flex-1 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg-muted hover:bg-inset/50 transition-colors"
 >
 {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
 <FileText size={14} />
 Transcript
 {!hasContent && <span className="text-xs text-fg-subtle font-normal">(empty)</span>}
 </button>
 {hasAudio && (
 <button
 onClick={() => transcribeMutation.mutate()}
 disabled={transcribeMutation.isPending}
 className="flex items-center gap-1.5 px-3 py-1.5 mr-2 text-xs font-medium text-accent hover:bg-accent-1 dark:hover:bg-accent-1 rounded-md transition-colors disabled:opacity-50"
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
 <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-danger-bg border border-danger/30 text-xs text-danger flex items-start gap-2">
 <span className="text-danger mt-0.5 flex-shrink-0">⚠</span>
 <span>
 {(transcribeMutation.error as Error)?.message?.includes('503')
 ? 'OpenAI API key not configured. Set keys.openai_key in project_config.yaml.'
 : `Transcription failed: ${(transcribeMutation.error as Error)?.message ?? 'Unknown error'}`}
 </span>
 </div>
 )}
 {expanded && (
 <div className="border-t border-border">
 <textarea
 value={value}
 onChange={(e) => handleChange(e.target.value)}
 onBlur={flush}
 placeholder="Paste or type transcript here..."
 className="w-full min-h-[200px] p-4 text-sm font-mono bg-surface text-fg resize-y focus:outline-none placeholder:text-fg-faint dark:placeholder:text-fg-muted"
 />
 </div>
 )}
 </div>
 )
}
