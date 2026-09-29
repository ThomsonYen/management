import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2 } from 'lucide-react'
import NoteEditor from './NoteEditor'
import SaveIndicator, { type SaveState } from './SaveIndicator'
import { matchesBinding, useHotkeys } from '../SettingsContext'

/**
 * Enlarge mode for notes that live inside a page (project and person notes):
 * the whole window becomes the title and the text in one centered column.
 * Edits go to the same draft as the inline editor, so closing loses nothing.
 */
export default function EnlargedNote({
  title,
  value,
  onChange,
  saveState,
  onClose,
}: {
  title: string
  value: string
  onChange: (md: string) => void
  saveState: SaveState
  onClose: () => void
}) {
  const { bindings } = useHotkeys()

  // Escape and the enlarge hotkey close it. Caught on window in the capture
  // phase so the page underneath (which uses Escape to clear selection or go
  // back) never sees them while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesBinding(e, bindings.escape) || matchesBinding(e, bindings.toggleNoteEnlarge)) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
    }
  }, [bindings.escape, bindings.toggleNoteEnlarge, onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-app overflow-y-auto" role="dialog" aria-label={`${title} notes`}>
      <div className="sticky top-0 z-10 flex items-center justify-end gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5 md:pt-4">
        <SaveIndicator state={saveState} />
        <button
          onClick={onClose}
          title="Leave enlarged view (Esc)"
          className="p-1.5 rounded-lg text-fg-faint hover:text-fg-muted hover:bg-inset transition-colors"
        >
          <Minimize2 size={16} />
        </button>
      </div>
      <div className="w-full max-w-[42rem] mx-auto px-4 md:px-6 pt-6 md:pt-12 pb-[env(safe-area-inset-bottom)]">
        <h1 className="font-note text-2xl md:text-3xl font-bold leading-tight text-fg">{title}</h1>
        <NoteEditor
          className="mt-5 min-h-[60vh]"
          value={value}
          onChange={onChange}
          placeholder="Start writing…"
          autoFocus
        />
      </div>
    </div>,
    document.body,
  )
}
