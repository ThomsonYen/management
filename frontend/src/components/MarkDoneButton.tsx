import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTodo } from '../api'
import type { Todo } from '../types'

const UNDO_SECONDS = 3

interface Props {
  todo: Todo
  queryKeys?: unknown[][]
}

export default function MarkDoneButton({ todo, queryKeys }: Props) {
  const [undoInfo, setUndoInfo] = useState<{ previousStatus: string; remaining: number } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

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
    setUndoInfo({ previousStatus, remaining: UNDO_SECONDS })
    intervalRef.current = setInterval(() => {
      setUndoInfo((prev) => {
        if (!prev) return null
        if (prev.remaining <= 1) {
          clearInterval(intervalRef.current!)
          return null
        }
        return { ...prev, remaining: prev.remaining - 1 }
      })
    }, 1000)
  }

  const handleUndo = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    updateMutation.mutate({ status: undoInfo!.previousStatus })
    setUndoInfo(null)
  }

  if (undoInfo) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-green-600 font-medium">✓ Done!</span>
        <button
          onClick={handleUndo}
          className="text-xs px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-800 transition-colors font-medium"
        >
          Undo ({undoInfo.remaining}s)
        </button>
      </div>
    )
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
