import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateTodo } from '../api'
import type { Todo } from '../types'
import { useToast } from '../ToastContext'
import { patchTodoCaches } from '../utils/optimisticTodo'

type FocusRef = Pick<Todo, 'id' | 'title' | 'focus_order'>

/**
 * Take todos off the Focus list right away and offer an Undo toast
 * (bottom right, `undo_toast_seconds`). Undo puts each todo back at its
 * original `focus_order`, so it returns to the same spot in the list.
 */
export function useUnfocusWithUndo() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useCallback((todos: FocusRef[]) => {
    if (todos.length === 0) return
    const resync = () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      todos.forEach((t) => queryClient.invalidateQueries({ queryKey: ['todo', t.id] }))
    }
    const setFocus = (focused: boolean) => {
      todos.forEach((t) => patchTodoCaches(queryClient, t.id, { is_focused: focused }))
      return Promise.all(
        todos.map((t) => updateTodo(t.id, focused ? { is_focused: true, focus_order: t.focus_order } : { is_focused: false })),
      ).finally(resync)
    }

    setFocus(false)
    showToast({
      message: todos.length === 1 ? `Removed "${todos[0].title}" from Focus` : `Removed ${todos.length} todos from Focus`,
      action: { label: 'Undo', onClick: () => { setFocus(true) } },
    })
  }, [queryClient, showToast])
}
