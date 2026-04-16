import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTodo } from '../api'
import { useToast } from '../ToastContext'
import type { Todo } from '../types'

interface Props {
  todo: Todo
  queryKeys?: unknown[][]
}

export default function MarkDoneButton({ todo, queryKeys }: Props) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const invalidate = () => {
    const keys = queryKeys || [['todos']]
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
    queryClient.invalidateQueries({ queryKey: ['recently-done'] })
  }

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(todo.id, data),
    onSuccess: invalidate,
  })

  const markDone = () => {
    const previousStatus = todo.status
    updateMutation.mutate({ status: 'done' })
    showToast({
      message: `Marked "${todo.title}" done`,
      tone: 'success',
      action: {
        label: 'Undo',
        onClick: () => updateMutation.mutate({ status: previousStatus }),
      },
    })
  }

  if (todo.status === 'done') {
    return (
      <button
        onClick={() => updateMutation.mutate({ status: 'todo' })}
        disabled={updateMutation.isPending}
        className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors font-medium disabled:opacity-40"
      >
        ↩ Reopen
      </button>
    )
  }

  return (
    <button
      onClick={markDone}
      disabled={updateMutation.isPending}
      className="text-xs px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-800 transition-colors font-medium disabled:opacity-40"
    >
      ✓ Done
    </button>
  )
}
