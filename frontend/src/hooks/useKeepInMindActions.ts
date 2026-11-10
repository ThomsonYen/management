import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keepInMindTodo, unkeepInMindTodo, updateTodo } from '../api'
import type { Todo } from '../types'
import { useToast } from '../ToastContext'
import { patchTodoCaches } from '../utils/optimisticTodo'

type Ref = Pick<Todo, 'id' | 'title' | 'is_focused' | 'focus_order' | 'status'>

/**
 * Move todos onto Keep in Mind and back, and complete them there. Like the
 * follow-up actions, every change patches the caches at once and offers Undo.
 */
export function useKeepInMindActions() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const sync = useCallback((p: Promise<unknown>, ids: number[]) => {
    p.catch(() => {}).then(() => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['recently-done'] })
      ids.forEach((id) => queryClient.invalidateQueries({ queryKey: ['todo', id] }))
    })
  }, [queryClient])

  const toKeepInMind = useCallback((todos: Ref[]) => {
    const items = todos.filter((t) => t.status !== 'done')
    if (items.length === 0) return
    items.forEach((t) => patchTodoCaches(queryClient, t.id, {
      is_keep_in_mind: true, keep_in_mind_since: new Date().toISOString(), is_focused: false,
      is_followup: false, followup_since: null, check_back_on: null, check_back_due: false,
    }))
    sync(Promise.all(items.map((t) => keepInMindTodo(t.id))), items.map((t) => t.id))
    showToast({
      message: items.length === 1 ? `Keeping "${items[0].title}" in mind` : `Moved ${items.length} todos to Keep in mind`,
      action: {
        label: 'Undo',
        onClick: () => {
          items.forEach((t) => patchTodoCaches(queryClient, t.id, { is_keep_in_mind: false, keep_in_mind_since: null, is_focused: t.is_focused }))
          sync(Promise.all(items.map(async (t) => {
            await unkeepInMindTodo(t.id)
            if (t.is_focused) await updateTodo(t.id, { is_focused: true, focus_order: t.focus_order })
          })), items.map((t) => t.id))
        },
      },
    })
  }, [queryClient, showToast, sync])

  const fromKeepInMind = useCallback((todos: Ref[], focus = true) => {
    if (todos.length === 0) return
    todos.forEach((t) => patchTodoCaches(queryClient, t.id, {
      is_keep_in_mind: false, keep_in_mind_since: null,
      ...(focus ? { is_focused: true, focus_order: Number.MAX_SAFE_INTEGER } : {}),
    }))
    sync(Promise.all(todos.map((t) => unkeepInMindTodo(t.id, focus))), todos.map((t) => t.id))
    showToast({
      message: todos.length === 1
        ? (focus ? `"${todos[0].title}" is on Focus` : `"${todos[0].title}" is a todo again`)
        : `${todos.length} todos left Keep in mind`,
      tone: 'success',
      action: {
        label: 'Undo',
        onClick: () => { sync(Promise.all(todos.map((t) => keepInMindTodo(t.id))), todos.map((t) => t.id)) },
      },
    })
  }, [queryClient, showToast, sync])

  const complete = useCallback((t: Ref) => {
    patchTodoCaches(queryClient, t.id, { status: 'done' })
    sync(updateTodo(t.id, { status: 'done' }), [t.id])
    showToast({
      message: `Completed "${t.title}"`,
      tone: 'success',
      action: { label: 'Undo', onClick: () => { sync(updateTodo(t.id, { status: 'todo' }), [t.id]) } },
    })
  }, [queryClient, showToast, sync])

  const setHours = useCallback((t: Ref, hours: number) => {
    patchTodoCaches(queryClient, t.id, { estimated_hours: hours })
    sync(updateTodo(t.id, { estimated_hours: hours }), [t.id])
  }, [queryClient, sync])

  return useMemo(() => ({ toKeepInMind, fromKeepInMind, complete, setHours }), [toKeepInMind, fromKeepInMind, complete, setHours])
}
