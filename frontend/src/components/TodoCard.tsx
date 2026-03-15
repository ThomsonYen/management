import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteTodo, updateSubTodo } from '../api'
import type { Todo } from '../types'

const importanceBadge = (imp: string) => {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-blue-100 text-blue-700 border-blue-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
  }
  return map[imp] || 'bg-slate-100 text-slate-600 border-slate-200'
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-600',
    'in-progress': 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
  }
  return map[s] || 'bg-slate-100 text-slate-600'
}

interface TodoCardProps {
  todo: Todo
  onEdit: (todo: Todo) => void
  onOpenDetail?: () => void
  queryKeys?: unknown[][]
}

export default function TodoCard({ todo, onEdit, onOpenDetail, queryKeys }: TodoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const invalidate = () => {
    const keys = queryKeys || [['todos']]
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteTodo(todo.id),
    onSuccess: invalidate,
  })

  const toggleSubTodo = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      updateSubTodo(id, { done }),
    onSuccess: invalidate,
  })

  const doneSubs = todo.subtodos.filter((s) => s.done).length
  const totalSubs = todo.subtodos.length

  const isOverdue =
    todo.deadline &&
    todo.status !== 'done' &&
    new Date(todo.deadline) < new Date()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 cursor-pointer select-none hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${importanceBadge(
                  todo.importance,
                )}`}
              >
                {todo.importance}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge(
                  todo.status,
                )}`}
              >
                {todo.status}
              </span>
              {todo.is_blocked && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  blocked
                </span>
              )}
              {isOverdue && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">
                  OVERDUE
                </span>
              )}
            </div>
            <h3 className="font-semibold text-slate-800 text-base leading-tight">{todo.title}</h3>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
              {todo.assignee_name && (
                <span className="flex items-center gap-1">
                  <span>◉</span> {todo.assignee_name}
                </span>
              )}
              {todo.deadline && (
                <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                  <span>◷</span> {todo.deadline}
                </span>
              )}
              {todo.project_name && (
                <span className="flex items-center gap-1">
                  <span>◈</span> {todo.project_name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span>⏱</span> {todo.estimated_hours}h
              </span>
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            {totalSubs > 0 && (
              <span className="text-xs text-slate-500 mr-1">
                {doneSubs}/{totalSubs}
              </span>
            )}
            <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Sub-todo progress bar */}
        {totalSubs > 0 && (
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${(doneSubs / totalSubs) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {todo.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Description
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{todo.description}</p>
            </div>
          )}

          {todo.subtodos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Sub-tasks ({doneSubs}/{totalSubs})
              </p>
              <ul className="space-y-1.5">
                {todo.subtodos
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={(e) =>
                          toggleSubTodo.mutate({ id: s.id, done: e.target.checked })
                        }
                        className="accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <span
                        className={`text-sm ${
                          s.done ? 'line-through text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        {s.title}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {todo.blocked_by_ids.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Blocked by
              </p>
              <p className="text-sm text-slate-600">
                Todo IDs: {todo.blocked_by_ids.join(', ')}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {onOpenDetail && (
              <button
                onClick={onOpenDetail}
                className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900 transition-colors"
              >
                Open
              </button>
            )}
            <button
              onClick={() => onEdit(todo)}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (window.confirm('Delete this todo?')) {
                  deleteMutation.mutate()
                }
              }}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors border border-red-200"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
