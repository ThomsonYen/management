import { useState } from 'react'
import { Mic, Square, Monitor, Loader2 } from 'lucide-react'
import {
 useRecording,
 supportsSystemAudio,
 getSystemAudioDevice,
 type RecordingMode,
} from '../RecordingContext'

function formatDuration(seconds: number): string {
 const m = Math.floor(seconds / 60)
 const s = seconds % 60
 return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioRecorder({ noteId }: { noteId: number }) {
 const { isRecording, noteId: recordingNoteId, duration, error, isUploading, start, stop } =
 useRecording()
 const configuredDevice = getSystemAudioDevice()
 const systemAudioMode: RecordingMode = configuredDevice ? 'mic+device' : 'mic+system'
 const [includeSystem, setIncludeSystem] = useState(false)
 const mode: RecordingMode = includeSystem ? systemAudioMode : 'mic'

 const isThisNote = recordingNoteId === noteId
 const isOtherNote = isRecording && !isThisNote

 const handleStart = () => start(noteId, mode)
 const handleStop = () => stop()

 return (
 <div className="space-y-2">
 {!isThisNote || !isRecording ? (
 <>
 <div className="flex items-center gap-2">
 <button
 onClick={handleStart}
 disabled={isUploading || isOtherNote}
 title={isOtherNote ? `Recording in progress on another meeting note` : undefined}
 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-danger-bg text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
 >
 {isUploading && isThisNote ? (
 <>
 <Loader2 size={12} className="animate-spin" /> Uploading...
 </>
 ) : (
 <>
 <Mic size={12} /> Record
 </>
 )}
 </button>
 {supportsSystemAudio && (
 <label
 className="flex items-center gap-1 text-xs text-fg-muted cursor-pointer"
 title={configuredDevice ? `Captures via "${configuredDevice.label}"` : undefined}
 >
 <input
 type="checkbox"
 checked={includeSystem}
 onChange={(e) => setIncludeSystem(e.target.checked)}
 className="rounded border-border text-accent focus:ring-accent h-3 w-3"
 />
 <Monitor size={10} />
 System audio
 </label>
 )}
 </div>
 {includeSystem && mode === 'mic+system' && (
 <p className="text-xs text-fg-subtle leading-tight">
 Your browser will ask you to share a screen. Check "Share audio" to capture meeting
 audio. (Tip: configure a loopback device in Settings → Recording to skip this prompt.)
 </p>
 )}
 {includeSystem && mode === 'mic+device' && configuredDevice && (
 <p className="text-xs text-fg-subtle leading-tight">
 Capturing from <span className="font-mono">{configuredDevice.label}</span>.
 </p>
 )}
 {isOtherNote && (
 <p className="text-xs text-warning dark:text-warning leading-tight">
 Recording in progress on another meeting note.
 </p>
 )}
 </>
 ) : (
 <div className="flex items-center gap-2">
 <span className="relative flex h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
 </span>
 <span className="text-xs font-mono text-danger">
 {formatDuration(duration)}
 </span>
 <button
 onClick={handleStop}
 className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-inset text-fg rounded hover:bg-inset transition-colors"
 >
 <Square size={10} /> Stop
 </button>
 </div>
 )}
 {error && <p className="text-xs text-danger">{error}</p>}
 </div>
 )
}
