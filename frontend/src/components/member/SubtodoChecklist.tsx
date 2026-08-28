import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { createSubTodo, deleteSubTodo, updateSubTodo } from '../../api'
import type { Todo } from '../../types'
import {
  patchSubtodoCaches,
  restoreTodoCaches,
  snapshotTodoCaches,
  type TodoCachesSnapshot,
} from '../../utils/optimisticTodo'
import { Checkbox } from '../ui'

interface Props {
  todo: Todo
  editable: boolean
}

/** Sub-task checklist for the member shell (toggle / add / remove, optimistic). */
export default function SubtodoChecklist({ todo, editable }: Props) {
  const queryClient = useQueryClient()
  const [newTitle, setNewTitle] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
    queryClient.invalidateQueries({ queryKey: ['todo', todo.id] })
  }
  const rollback = (_err: unknown, _vars: unknown, snapshot?: TodoCachesSnapshot) =>
    restoreTodoCaches(queryClient, todo.id, snapshot)

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => updateSubTodo(id, { done }),
    onMutate: async ({ id, done }) => {
      const snapshot = await snapshotTodoCaches(queryClient, todo.id)
      patchSubtodoCaches(queryClient, todo.id, (subs) => subs.map((s) => (s.id === id ? { ...s, done } : s)))
      return snapshot
    },
    onError: rollback,
    onSettled: invalidate,
  })

  const add = useMutation({
    mutationFn: (title: string) => createSubTodo(todo.id, { title, order: todo.subtodos.length }),
    onMutate: async (title) => {
      setNewTitle('')
      const snapshot = await snapshotTodoCaches(queryClient, todo.id)
      patchSubtodoCaches(queryClient, todo.id, (subs) => [
        ...subs,
        { id: -Date.now(), title, done: false, order: subs.length }, // placeholder until refetch
      ])
      return snapshot
    },
    onError: rollback,
    onSettled: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteSubTodo(id),
    onMutate: async (id) => {
      const snapshot = await snapshotTodoCaches(queryClient, todo.id)
      patchSubtodoCaches(queryClient, todo.id, (subs) => subs.filter((s) => s.id !== id))
      return snapshot
    },
    onError: rollback,
    onSettled: invalidate,
  })

  const subs = [...todo.subtodos].sort((a, b) => a.order - b.order || a.id - b.id)
  const doneCount = subs.filter((s) => s.done).length

  return (
    <div>
      <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
        Sub-tasks{subs.length > 0 && ` (${doneCount}/${subs.length})`}
      </p>
      {subs.length > 0 && (
        <ul className="space-y-1.5">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.done}
                disabled={!editable || s.id < 0}
                onChange={() => toggle.mutate({ id: s.id, done: !s.done })}
              />
              <span className={`flex-1 min-w-0 ${s.done ? 'line-through text-fg-subtle' : 'text-fg'}`}>{s.title}</span>
              {editable && s.id > 0 && (
                <button
                  onClick={() => remove.mutate(s.id)}
                  className="text-fg-subtle hover:text-danger transition-colors"
                  title="Remove sub-task"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!editable && subs.length === 0 && <p className="text-sm text-fg-subtle">None</p>}
      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const title = newTitle.trim()
            if (title) add.mutate(title)
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a sub-task…"
            className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-md border border-border bg-app text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || add.isPending}
            className="text-xs px-3 py-1.5 rounded-md bg-accent text-fg-on-accent font-medium disabled:opacity-50 transition-opacity"
          >
            Add
          </button>
        </form>
      )}
    </div>
  )
}
