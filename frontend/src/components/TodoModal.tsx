import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTodo,
  updateTodo,
  fetchPersons,
  fetchProjects,
  fetchTodos,
  createSubTodo,
  updateSubTodo,
  deleteSubTodo,
} from '../api'
import type { Todo, SubTodo } from '../types'
import DatePicker from './DatePicker'
import { useTodoDefaults } from '../TodoDefaultsContext'
import { useTimezone } from '../TimezoneContext'
import { getTodayString } from '../dateUtils'

interface Props {
  todo?: Todo | null
  onClose: () => void
  invalidateKeys?: unknown[][]
  defaultAssigneeId?: number
}

const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']
const STATUS_OPTIONS = ['todo', 'in-progress', 'done']

export default function TodoModal({ todo, onClose, invalidateKeys, defaultAssigneeId }: Props) {
  const queryClient = useQueryClient()
  const { defaults } = useTodoDefaults()
  const { timezone } = useTimezone()
  const isEdit = !!todo

  const todayStr = getTodayString(timezone)

  const [title, setTitle] = useState(todo?.title || '')
  const [description, setDescription] = useState(todo?.description || '')
  const [projectId, setProjectId] = useState<string>(todo?.project_id?.toString() || '')
  const [assigneeId, setAssigneeId] = useState<string>(todo?.assignee_id?.toString() || (isEdit ? '' : (defaultAssigneeId?.toString() || defaults.assigneeId)))
  const [deadline, setDeadline] = useState(todo?.deadline || (isEdit ? '' : defaults.deadlineToToday ? todayStr : ''))
  const [importance, setImportance] = useState(todo?.importance || (isEdit ? 'medium' : defaults.importance))
  const [estimatedHours, setEstimatedHours] = useState(todo?.estimated_hours?.toString() || (isEdit ? '1' : defaults.estimatedHours))
  const rawStatus = todo?.status || 'todo'
  const [status, setStatus] = useState(STATUS_OPTIONS.includes(rawStatus) ? rawStatus : 'todo')
  const [blockedByIds, setBlockedByIds] = useState<number[]>(todo?.blocked_by_ids || [])
  const [subtodos, setSubtodos] = useState<SubTodo[]>(todo?.subtodos || [])
  const [newSubTitle, setNewSubTitle] = useState('')
  const [error, setError] = useState('')

  const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const { data: allTodos = [] } = useQuery({ queryKey: ['todos'], queryFn: () => fetchTodos() })

  const invalidate = () => {
    const keys = invalidateKeys || [['todos']]
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
  }

  const createMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: () => setError('Failed to create todo'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(todo!.id, data),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: () => setError('Failed to update todo'),
  })

  const addSubTodoMutation = useMutation({
    mutationFn: ({ todoId, title }: { todoId: number; title: string }) =>
      createSubTodo(todoId, { title, order: subtodos.length }),
    onSuccess: (newSub) => {
      setSubtodos((prev) => [...prev, newSub])
      setNewSubTitle('')
    },
  })

  const toggleSubDone = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => updateSubTodo(id, { done }),
    onSuccess: (updated) => {
      setSubtodos((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    },
  })

  const removeSubTodo = useMutation({
    mutationFn: (id: number) => deleteSubTodo(id),
    onSuccess: (_, id) => {
      setSubtodos((prev) => prev.filter((s) => s.id !== id))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      project_id: projectId ? parseInt(projectId) : undefined,
      assignee_id: assigneeId ? parseInt(assigneeId) : null,
      deadline: deadline || undefined,
      importance,
      estimated_hours: parseFloat(estimatedHours) || 1,
      status,
      blocked_by_ids: blockedByIds,
    }
    if (isEdit) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleAddSubTodo = () => {
    if (!newSubTitle.trim()) return
    if (!todo) {
      // For new todos, we just stage locally; after save we can't attach yet
      // Add as a local placeholder
      setSubtodos((prev) => [
        ...prev,
        { id: -(Date.now()), title: newSubTitle.trim(), done: false, order: prev.length },
      ])
      setNewSubTitle('')
    } else {
      addSubTodoMutation.mutate({ todoId: todo.id, title: newSubTitle.trim() })
    }
  }

  const toggleBlocker = (id: number) => {
    setBlockedByIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const otherTodos = allTodos.filter((t) => t.id !== todo?.id)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {isEdit ? 'Edit Todo' : 'New Todo'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl font-bold transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Todo title..."
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Row: project + assignee */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— None —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: deadline + estimated hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                Deadline
              </label>
              <DatePicker
                value={deadline}
                onChange={setDeadline}
                variant="input"
                placeholder="No deadline"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                Estimated Hours
              </label>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Row: importance + status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                Importance
              </label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {IMPORTANCE_OPTIONS.map((o) => (
                  <option key={o} value={o} className="capitalize">
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Blocked by */}
          {otherTodos.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                Blocked by
              </label>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 max-h-36 overflow-y-auto space-y-1.5">
                {otherTodos.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blockedByIds.includes(t.id)}
                      onChange={() => toggleBlocker(t.id)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      #{t.id} — {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Sub-todos */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
              Sub-tasks
            </label>
            <div className="space-y-1.5 mb-2">
              {subtodos
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={(e) => {
                        if (s.id < 0) {
                          setSubtodos((prev) =>
                            prev.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)),
                          )
                        } else {
                          toggleSubDone.mutate({ id: s.id, done: e.target.checked })
                        }
                      }}
                      className="accent-indigo-600 w-4 h-4 cursor-pointer"
                    />
                    <span
                      className={`flex-1 text-sm ${
                        s.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {s.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (s.id < 0) {
                          setSubtodos((prev) => prev.filter((x) => x.id !== s.id))
                        } else {
                          removeSubTodo.mutate(s.id)
                        }
                      }}
                      className="text-red-400 hover:text-red-600 text-sm transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubTitle}
                onChange={(e) => setNewSubTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddSubTodo()
                  }
                }}
                placeholder="Add sub-task..."
                className="flex-1 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddSubTodo}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Create Todo'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
