import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, X } from 'lucide-react'
import { fetchTodo } from '../api'
import type { Todo } from '../types'
import TodoCard from './TodoCard'
import TodoModal from './TodoModal'
import { modalPanel } from '../theme/surfaces'

// Quick look at one todo over the current page: the page stays in place behind
// a light dim, and the todo's own card (expanded) sits in a modal-style sheet.
// "Go into" leaves for the full todo page. Opened app-wide by a card's "Open".

interface TodoPeekProps {
  todoId: number
  onClose: () => void
  onGoInto: (id: number) => void
}

export default function TodoPeek({ todoId, onClose, onGoInto }: TodoPeekProps) {
  const { data: todo, isLoading } = useQuery<Todo>({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
  })
  const [editing, setEditing] = useState<Todo | null>(null)

  // Esc closes the peek, unless the edit modal on top of it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onClose])

  return createPortal(
    <>
      <div
        className="peek-backdrop fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 pt-[8vh] md:pt-4 bg-black/30 backdrop-blur-[2px]"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={todo?.title ?? 'Todo'}
          className={`peek-panel ${modalPanel} max-w-3xl max-h-[84dvh]`}
        >
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-fg-subtle tabular-nums shrink-0">#{todoId}</span>
            {todo?.project_name && (
              <span className="text-xs text-fg-muted truncate">{todo.project_name}</span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onGoInto(todoId)}
                title="Go into todo page"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-accent bg-accent-1 hover:bg-accent-2 border border-accent-2 transition-colors"
              >
                Go into <ArrowUpRight size={13} />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                className="grid place-items-center w-7 h-7 rounded-lg text-fg-muted hover:text-fg hover:bg-inset transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto min-h-0 p-3 bg-app">
            {isLoading || !todo ? (
              <div className="bg-surface rounded-xl border border-border p-6 text-sm text-fg-muted">
                {isLoading ? 'Loading…' : 'This todo is no longer available.'}
              </div>
            ) : (
              <TodoCard
                todo={todo}
                onEdit={setEditing}
                queryKeys={[['todos'], ['todo', todoId]]}
                forceCollapseSignal={1}
              />
            )}
          </div>
        </div>
      </div>

      {editing && (
        <TodoModal
          todo={editing}
          onClose={() => setEditing(null)}
          invalidateKeys={[['todos'], ['todo', todoId]]}
        />
      )}
    </>,
    document.body,
  )
}
