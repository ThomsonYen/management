import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import type { AudioFileInfo } from '../types'
import { deleteAudio, getAudioDownloadUrl } from '../api'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AudioFileList({ noteId, files }: { noteId: number; files: AudioFileInfo[] }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => deleteAudio(noteId, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-note', noteId] })
    },
  })

  if (files.length === 0) return null

  return (
    <div className="space-y-1.5 mt-2">
      {files.map((f) => (
        <div
          key={f.filename}
          className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50"
        >
          <div className="flex-1 min-w-0">
            <audio
              controls
              preload="none"
              src={getAudioDownloadUrl(noteId, f.filename)}
              className="w-full h-8 [&::-webkit-media-controls-panel]:bg-transparent"
            />
            <p className="text-xs text-slate-400 mt-0.5 truncate">{formatSize(f.size_bytes)}</p>
          </div>
          <button
            onClick={() => deleteMutation.mutate(f.filename)}
            disabled={deleteMutation.isPending}
            className="p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-50 self-start mt-1"
            title="Delete recording"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
