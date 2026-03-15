import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchTodo,
  fetchTodos,
  updateSubTodo,
  createSubTodo,
  deleteSubTodo,
} from '../api'
import type { SubTodo, Todo } from '../types'
import TodoModal from '../components/TodoModal'

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

const statusDot = (s: string) => {
  const map: Record<string, string> = {
    todo: 'bg-slate-400',
    'in-progress': 'bg-blue-500',
    done: 'bg-green-500',
  }
  return map[s] || 'bg-slate-400'
}

export default function TodoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const todoId = Number(id)
  const navigate = useNavigate()
  const onBack = () => navigate(-1)
  const onOpenTodo = (newId: number) => navigate(`/todos/${newId}`)
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newSubtodoTitle, setNewSubtodoTitle] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const { data: todo, isLoading } = useQuery<Todo>({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
  })

  const { data: allTodos = [] } = useQuery<Todo[]>({
    queryKey: ['todos'],
    queryFn: () => fetchTodos(),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['todo', todoId] })
    queryClient.invalidateQueries({ queryKey: ['todos'] })
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
  }

  const toggleSubTodo = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      updateSubTodo(id, { done }),
    onSuccess: invalidate,
  })

  const addSubTodo = useMutation({
    mutationFn: (title: string) =>
      createSubTodo(todoId, { title, order: todo?.subtodos.length ?? 0 }),
    onSuccess: () => {
      setNewSubtodoTitle('')
      invalidate()
    },
  })

  const removeSubTodo = useMutation({
    mutationFn: (id: number) => deleteSubTodo(id),
    onSuccess: invalidate,
  })

  const reorderMutation = useMutation({
    mutationFn: async (subtodos: SubTodo[]) => {
      await Promise.all(subtodos.map((s, i) => updateSubTodo(s.id, { order: i })))
    },
    onSuccess: invalidate,
  })

  if (isLoading || !todo) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={onBack}
          className="mb-4 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          ← Back
        </button>
        <div className="text-slate-500">Loading...</div>
      </div>
    )
  }

  const sortedSubtodos = [...todo.subtodos].sort((a, b) => a.order - b.order)
  const doneSubs = sortedSubtodos.filter((s) => s.done).length
  const totalSubs = sortedSubtodos.length

  const blockers = allTodos.filter((t) => todo.blocked_by_ids.includes(t.id))
  const blocking = allTodos.filter((t) => t.blocked_by_ids.includes(todoId))

  const isOverdue =
    todo.deadline && todo.status !== 'done' && new Date(todo.deadline) < new Date()

  // Drag handlers
  const handleDragStart = (idx: number) => setDragIdx(idx)

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  const handleDrop = () => {
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }
    const reordered = [...sortedSubtodos]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dragOverIdx, 0, moved)
    reorderMutation.mutate(reordered)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  const handleAddSubtodo = () => {
    const title = newSubtodoTitle.trim()
    if (title) addSubTodo.mutate(title)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-5 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
      >
        ← Back
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-3">
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${importanceBadge(todo.importance)}`}
              >
                {todo.importance}
              </span>
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${statusBadge(todo.status)}`}
              >
                {todo.status}
              </span>
              {todo.is_blocked && (
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                  blocked
                </span>
              )}
              {isOverdue && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-600 text-white">
                  OVERDUE
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-800 leading-tight">{todo.title}</h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex-shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Edit
          </button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Assignee
            </p>
            <p className="text-sm font-medium text-slate-800">
              {todo.assignee_name || <span className="text-slate-400 font-normal">Unassigned</span>}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Deadline
            </p>
            <p
              className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-slate-800'}`}
            >
              {todo.deadline || <span className="text-slate-400 font-normal">None</span>}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Project
            </p>
            <p className="text-sm font-medium text-slate-800">
              {todo.project_name || <span className="text-slate-400 font-normal">None</span>}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Est. Hours
            </p>
            <p className="text-sm font-medium text-slate-800">{todo.estimated_hours}h</p>
          </div>
        </div>

        {/* Description */}
        {todo.description && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Description
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {todo.description}
            </p>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400">
          Created {new Date(todo.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Subtasks card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Subtasks
          </h2>
          {totalSubs > 0 && (
            <span className="text-sm text-slate-500">
              {doneSubs}/{totalSubs}
            </span>
          )}
        </div>

        {totalSubs > 0 && (
          <div className="mb-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${(doneSubs / totalSubs) * 100}%` }}
            />
          </div>
        )}

        {/* Draggable subtodo list */}
        {sortedSubtodos.length > 0 ? (
          <ul className="space-y-1 mb-4">
            {sortedSubtodos.map((s, idx) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors select-none
                  ${dragIdx === idx ? 'opacity-40 bg-slate-50 border-slate-200' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}
                  ${dragOverIdx === idx && dragIdx !== idx ? 'border-indigo-400 bg-indigo-50' : ''}
                `}
              >
                <span className="cursor-grab text-slate-300 hover:text-slate-500 text-lg leading-none flex-shrink-0">
                  ⠿
                </span>
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={(e) => toggleSubTodo.mutate({ id: s.id, done: e.target.checked })}
                  className="accent-indigo-600 w-4 h-4 cursor-pointer flex-shrink-0"
                />
                <span
                  className={`flex-1 text-sm ${
                    s.done ? 'line-through text-slate-400' : 'text-slate-700'
                  }`}
                >
                  {s.title}
                </span>
                <button
                  onClick={() => removeSubTodo.mutate(s.id)}
                  className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 mb-4">No subtasks yet.</p>
        )}

        {/* Add new subtask */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newSubtodoTitle}
            onChange={(e) => setNewSubtodoTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtodo()}
            placeholder="Add a subtask..."
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleAddSubtodo}
            disabled={!newSubtodoTitle.trim() || addSubTodo.isPending}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Blocked by */}
      {(blockers.length > 0 || todo.blocked_by_ids.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Blocked by
          </h2>
          <ul className="space-y-2">
            {blockers.map((blocker) => (
              <li key={blocker.id}>
                <button
                  onClick={() => onOpenTodo(blocker.id)}
                  className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(blocker.status)}`} />
                  <span className="flex-1 text-sm font-medium text-slate-700">{blocker.title}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusBadge(blocker.status)}`}
                  >
                    {blocker.status}
                  </span>
                  <span className="text-xs text-slate-400">→</span>
                </button>
              </li>
            ))}
            {/* Show unresolved IDs if any */}
            {todo.blocked_by_ids
              .filter((id) => !blockers.find((b) => b.id === id))
              .map((id) => (
                <li key={id} className="px-3 py-2 text-sm text-slate-400">
                  Todo #{id} (not found)
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Blocking others */}
      {blocking.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Blocking
          </h2>
          <ul className="space-y-2">
            {blocking.map((blocked) => (
              <li key={blocked.id}>
                <button
                  onClick={() => onOpenTodo(blocked.id)}
                  className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(blocked.status)}`} />
                  <span className="flex-1 text-sm font-medium text-slate-700">{blocked.title}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusBadge(blocked.status)}`}
                  >
                    {blocked.status}
                  </span>
                  <span className="text-xs text-slate-400">→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showModal && (
        <TodoModal
          todo={todo}
          onClose={() => {
            setShowModal(false)
            invalidate()
          }}
          invalidateKeys={[['todo', todoId], ['todos']]}
        />
      )}
    </div>
  )
}
