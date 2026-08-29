import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Search, Square } from 'lucide-react'
import { useRecording } from '../../RecordingContext'
import { routeTitle } from '../../navItems'

interface Props {
  /** Omit to hide the "+" button (member shell). */
  onNewTodo?: () => void
  /** Omit to hide the search button (member shell). */
  onOpenSearch?: () => void
  /** Overrides the title derived from the owner's nav items. */
  title?: string
}

export default function MobileHeader({ onNewTodo, onOpenSearch, title }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isRecording, noteId, duration, isUploading, stop } = useRecording()

  return (
    <header className="md:hidden sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-4 h-12">
        <h1 className="flex-1 min-w-0 truncate text-base font-semibold text-fg">
          {title ?? routeTitle(location.pathname)}
        </h1>
        {(isRecording || isUploading) && noteId != null && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger-bg cursor-pointer"
            onClick={() => navigate(`/meeting-notes/${noteId}`)}
            title="Go to recording"
          >
            {isRecording && (
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
              </span>
            )}
            <span className="text-xs font-mono text-danger">
              {isUploading
                ? 'Uploading...'
                : `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`}
            </span>
            {isRecording && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  stop()
                }}
                className="p-1 -m-0.5 rounded text-danger"
                title="Stop recording"
              >
                <Square size={12} />
              </button>
            )}
          </div>
        )}
        {onNewTodo && (
          <button
            onClick={onNewTodo}
            className="p-2.5 -mr-1 rounded-md text-fg-muted active:bg-inset transition-colors"
            title="New todo"
          >
            <Plus size={20} />
          </button>
        )}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="p-2.5 -mr-2 rounded-md text-fg-muted active:bg-inset transition-colors"
            title="Search"
          >
            <Search size={20} />
          </button>
        )}
      </div>
    </header>
  )
}
