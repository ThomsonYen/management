import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import type { AudioFileInfo } from '../types'
import { deleteNoteAudio, getNoteAudioDownloadUrl } from '../api'

function formatSize(bytes: number): string {
 if (bytes < 1024) return `${bytes} B`
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
 return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AudioFileList({ noteId, files }: { noteId: number; files: AudioFileInfo[] }) {
 const queryClient = useQueryClient()

 const deleteMutation = useMutation({
 mutationFn: (filename: string) => deleteNoteAudio(noteId, filename),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['note', noteId] })
 },
 })

 if (files.length === 0) return null

 return (
 <div className="space-y-1.5 mt-2">
 {files.map((f) => (
 <div
 key={f.filename}
 className="flex items-center gap-2 p-2 bg-inset rounded-lg border border-border-subtle/50"
 >
 <div className="flex-1 min-w-0">
 <audio
 controls
 preload="none"
 src={getNoteAudioDownloadUrl(noteId, f.filename)}
 className="w-full h-8 [&::-webkit-media-controls-panel]:bg-transparent"
 />
 <p className="text-xs text-fg-subtle mt-0.5 truncate">{formatSize(f.size_bytes)}</p>
 </div>
 <button
 onClick={() => deleteMutation.mutate(f.filename)}
 disabled={deleteMutation.isPending}
 className="p-1 text-fg-faint hover:text-danger dark:text-fg-muted dark:hover:text-danger transition-colors flex-shrink-0 disabled:opacity-50 self-start mt-1"
 title="Delete recording"
 >
 <Trash2 size={13} />
 </button>
 </div>
 ))}
 </div>
 )
}
