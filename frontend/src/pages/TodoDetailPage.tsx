import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchTodo,
  fetchTodos,
  fetchPersons,
  fetchProjects,
  updateTodo,
  updateSubTodo,
  createSubTodo,
  deleteSubTodo,
  createTodo,
} from '../api'
import type { SubTodo, Todo, Person, Project } from '../types'
import TodoModal from '../components/TodoModal'
import { BlockerTreeNode, BlockingTreeNode } from '../components/BlockerTree'
import { config } from '../config'

const importanceBadge = (imp: string) => {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    high: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
    medium: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    low: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-700',
  }
  return map[imp] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-700'
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    'in-progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return map[s] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
}


function BlockerPicker({
  allTodos,
  excludeId,
  selectedIds,
  onSelect,
  onCreate,
}: {
  allTodos: Todo[]
  excludeId: number
  selectedIds: number[]
  onSelect: (todo: Todo) => void
  onCreate?: (title: string) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const trimmed = search.trim()
  const filtered = trimmed
    ? allTodos.filter(
        (t) =>
          t.id !== excludeId &&
          !selectedIds.includes(t.id) &&
          t.title.toLowerCase().includes(trimmed.toLowerCase())
      )
    : []

  const showCreate = onCreate && trimmed && !filtered.some((t) => t.title.toLowerCase() === trimmed.toLowerCase())

  return (
    <div className="relative mt-3">
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search todos to add..."
        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300 dark:placeholder-slate-500 dark:bg-slate-700 dark:text-slate-100"
      />
      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          {filtered.map((t) => (
            <li
              key={t.id}
              onMouseDown={() => { onSelect(t); setSearch(''); setOpen(false) }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center gap-2"
            >
              <span className="text-slate-400 dark:text-slate-500 text-xs flex-shrink-0">#{t.id}</span>
              <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">{t.title}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 capitalize flex-shrink-0">{t.status}</span>
            </li>
          ))}
          {showCreate && (
            <li
              onMouseDown={() => { onCreate(trimmed); setSearch(''); setOpen(false) }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700"
            >
              <span className="text-green-600 text-xs flex-shrink-0">+</span>
              <span className="flex-1 text-green-700">Create &quot;{trimmed}&quot;</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
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
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingSubId, setEditingSubId] = useState<number | null>(null)
  const [editingSubTitle, setEditingSubTitle] = useState('')
  const [isDying, setIsDying] = useState(false)
  const dyingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (dyingTimeoutRef.current) {
        clearTimeout(dyingTimeoutRef.current)
        updateTodo(todoId, { status: 'done' })
      }
    }
  }, [todoId])

  const { data: todo, isLoading } = useQuery<Todo>({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
  })

  const { data: allTodos = [] } = useQuery<Todo[]>({
    queryKey: ['todos'],
    queryFn: () => fetchTodos(),
  })

  const { data: persons = [] } = useQuery<Person[]>({
    queryKey: ['persons'],
    queryFn: fetchPersons,
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['todo', todoId] })
    queryClient.invalidateQueries({ queryKey: ['todos'] })
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
    queryClient.invalidateQueries({ queryKey: ['recently-done'] })
  }

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(todoId, data),
    onSuccess: invalidate,
  })

  const handleDoneCheck = (checked: boolean) => {
    if (checked && todo?.status !== 'done') {
      setIsDying(true)
      dyingTimeoutRef.current = setTimeout(() => {
        updateMutation.mutate({ status: 'done' })
      }, config.todo_done_fade_seconds * 1000)
    } else if (!checked) {
      if (dyingTimeoutRef.current) clearTimeout(dyingTimeoutRef.current)
      setIsDying(false)
      if (todo?.status === 'done') updateMutation.mutate({ status: 'todo' })
    }
  }

  const saveField = (field: string, value: unknown) => {
    updateMutation.mutate({ [field]: value } as Parameters<typeof updateTodo>[1])
    setEditingField(null)
  }

  const startEdit = (e: React.MouseEvent, field: string, currentValue: string) => {
    e.stopPropagation()
    setEditingField(field)
    setEditValue(currentValue)
  }

  const autoOpenSelect = (el: HTMLSelectElement | null) => {
    if (el) {
      el.focus()
      try { el.showPicker() } catch { /* not supported in all browsers */ }
    }
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
        <div className="text-slate-500 dark:text-slate-400">Loading...</div>
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
    // After removing dragIdx, items shift left — adjust insertion point accordingly
    const insertAt = dragOverIdx > dragIdx ? dragOverIdx - 1 : dragOverIdx
    reordered.splice(insertAt, 0, moved)
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
    <div
      className="p-6 max-w-3xl mx-auto"
      style={{ opacity: isDying ? 0 : 1, transition: `opacity ${config.todo_done_fade_seconds}s ease` }}
    >
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-5 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
      >
        ← Back
      </button>

      {/* Header card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-3 items-center">
              <button
                onClick={() => updateMutation.mutate({ is_focused: !todo.is_focused })}
                title={todo.is_focused ? 'Remove from Focus' : 'Add to Focus'}
                className={`text-xl leading-none transition-colors ${
                  todo.is_focused
                    ? 'text-amber-500 hover:text-amber-600'
                    : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                }`}
              >
                {todo.is_focused ? '★' : '☆'}
              </button>
              {editingField === 'importance' ? (
                <select
                  ref={autoOpenSelect}
                  value={todo.importance}
                  onChange={(e) => saveField('importance', e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${importanceBadge(todo.importance)}`}
                >
                  {['low', 'medium', 'high', 'critical'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <span
                  onClick={(e) => startEdit(e, 'importance', todo.importance)}
                  title="Click to change importance"
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all ${importanceBadge(todo.importance)}`}
                >
                  {todo.importance}
                </span>
              )}
              {editingField === 'status' ? (
                <select
                  ref={autoOpenSelect}
                  value={todo.status}
                  onChange={(e) => saveField('status', e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${statusBadge(todo.status)}`}
                >
                  {['todo', 'in-progress', 'done', 'blocked'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <span
                  onClick={(e) => startEdit(e, 'status', todo.status)}
                  title="Click to change status"
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all ${statusBadge(todo.status)}`}
                >
                  {todo.status}
                </span>
              )}
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
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{todo.title}</h1>
          </div>
          <div className="flex-shrink-0 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isDying || todo.status === 'done'}
                onChange={(e) => handleDoneCheck(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer accent-green-600"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">Done</span>
            </label>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div
            onClick={(e) => startEdit(e, 'assignee_id', todo.assignee_id?.toString() || '')}
            title="Click to change assignee"
            className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:ring-1 hover:ring-indigo-200 transition-all"
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Assignee
            </p>
            {editingField === 'assignee_id' ? (
              <select
                ref={autoOpenSelect}
                value={todo.assignee_id?.toString() || ''}
                onChange={(e) => saveField('assignee_id', e.target.value ? parseInt(e.target.value) : null)}
                onBlur={() => setEditingField(null)}
                onClick={(e) => e.stopPropagation()}
                className="text-sm w-full bg-transparent border-b border-indigo-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {todo.assignee_name || <span className="text-slate-400 dark:text-slate-500 font-normal">Unassigned</span>}
              </p>
            )}
          </div>
          <div
            onClick={(e) => startEdit(e, 'deadline', todo.deadline || '')}
            title="Click to change deadline"
            className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:ring-1 hover:ring-indigo-200 transition-all"
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Deadline
            </p>
            {editingField === 'deadline' ? (
              <input
                autoFocus
                type="date"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveField('deadline', editValue || null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveField('deadline', editValue || null)
                  if (e.key === 'Escape') setEditingField(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm w-full bg-transparent border-b border-indigo-400 focus:outline-none"
              />
            ) : (
              <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-slate-800'}`}>
                {todo.deadline || <span className="text-slate-400 dark:text-slate-500 font-normal">None</span>}
              </p>
            )}
          </div>
          <div
            onClick={(e) => startEdit(e, 'project_id', todo.project_id?.toString() || '')}
            title="Click to change project"
            className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:ring-1 hover:ring-indigo-200 transition-all"
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Project
            </p>
            {editingField === 'project_id' ? (
              <select
                ref={autoOpenSelect}
                value={todo.project_id?.toString() || ''}
                onChange={(e) => saveField('project_id', e.target.value ? parseInt(e.target.value) : null)}
                onBlur={() => setEditingField(null)}
                onClick={(e) => e.stopPropagation()}
                className="text-sm w-full bg-transparent border-b border-indigo-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {todo.project_name || <span className="text-slate-400 dark:text-slate-500 font-normal">None</span>}
              </p>
            )}
          </div>
          <div
            onClick={(e) => startEdit(e, 'estimated_hours', todo.estimated_hours.toString())}
            title="Click to change estimated hours"
            className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:ring-1 hover:ring-indigo-200 transition-all"
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Est. Hours
            </p>
            {editingField === 'estimated_hours' ? (
              <input
                autoFocus
                type="number"
                min="0.25"
                step="0.25"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveField('estimated_hours', parseFloat(editValue) || 1)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveField('estimated_hours', parseFloat(editValue) || 1)
                  if (e.key === 'Escape') setEditingField(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm w-full bg-transparent border-b border-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{todo.estimated_hours}h</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Description
          </p>
          {editingField === 'description' ? (
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveField('description', editValue || null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingField(null)
              }}
              onClick={(e) => e.stopPropagation()}
              rows={4}
              className="text-sm text-slate-700 dark:text-slate-300 w-full bg-transparent border border-indigo-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none leading-relaxed"
            />
          ) : (
            <p
              onClick={(e) => startEdit(e, 'description', todo.description || '')}
              title="Click to edit description"
              className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed cursor-pointer hover:text-indigo-600 transition-colors min-h-[1.5rem]"
            >
              {todo.description || <em className="text-slate-300 dark:text-slate-600 not-italic">+ Add a description...</em>}
            </p>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Created {new Date(todo.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Subtasks card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            Subtasks
          </h2>
          {totalSubs > 0 && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {doneSubs}/{totalSubs}
            </span>
          )}
        </div>

        {totalSubs > 0 && (
          <div className="mb-4 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${(doneSubs / totalSubs) * 100}%` }}
            />
          </div>
        )}

        {/* Draggable subtodo list */}
        {sortedSubtodos.length > 0 ? (
          <ul>
            {sortedSubtodos.map((s, idx) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors select-none border-t-2
                  ${dragIdx === idx ? 'opacity-40' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}
                  ${dragOverIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-indigo-400' : 'border-transparent'}
                `}
              >
                <span className="cursor-grab text-slate-300 dark:text-slate-600 hover:text-slate-500 text-lg leading-none flex-shrink-0">
                  ⠿
                </span>
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={(e) => toggleSubTodo.mutate({ id: s.id, done: e.target.checked })}
                  className="accent-indigo-600 w-4 h-4 cursor-pointer flex-shrink-0"
                />
                {editingSubId === s.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingSubTitle}
                    onChange={(e) => setEditingSubTitle(e.target.value)}
                    onBlur={() => {
                      if (editingSubTitle.trim()) updateSubTodo(s.id, { title: editingSubTitle.trim() }).then(invalidate)
                      setEditingSubId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editingSubTitle.trim()) {
                        updateSubTodo(s.id, { title: editingSubTitle.trim() }).then(invalidate)
                        setEditingSubId(null)
                      }
                      if (e.key === 'Escape') setEditingSubId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-sm text-slate-700 dark:text-slate-300 bg-transparent border-b border-indigo-400 focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => { setEditingSubId(s.id); setEditingSubTitle(s.title) }}
                    title="Click to edit"
                    className={`flex-1 text-sm cursor-pointer hover:text-indigo-600 transition-colors ${
                      s.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {s.title}
                  </span>
                )}
                <button
                  onClick={() => removeSubTodo.mutate(s.id)}
                  className="flex-shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">No subtasks yet.</p>
        )}

        {/* Add new subtask — also acts as the drop zone for the last position */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverIdx(sortedSubtodos.length) }}
          onDrop={handleDrop}
          className={`flex gap-2 border-t-2 transition-colors pt-3 ${
            dragOverIdx === sortedSubtodos.length && dragIdx !== null ? 'border-indigo-400' : 'border-transparent'
          }`}
        >
          <input
            type="text"
            value={newSubtodoTitle}
            onChange={(e) => setNewSubtodoTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtodo()}
            placeholder="Add a subtask..."
            className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-slate-100"
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
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">
          Blocked by
        </h2>
        {blockers.length > 0 && (
          <ul className="space-y-2 mb-1">
            {blockers.map((blocker) => (
              <BlockerTreeNode
                key={blocker.id}
                todo={blocker}
                allTodos={allTodos}
                onOpenTodo={onOpenTodo}
                onRemove={() => updateMutation.mutate({ blocked_by_ids: todo.blocked_by_ids.filter((id) => id !== blocker.id) })}
                visited={new Set([todoId])}
              />
            ))}
            {todo.blocked_by_ids
              .filter((id) => !blockers.find((b) => b.id === id))
              .map((id) => (
                <li key={id} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 text-sm text-slate-400 dark:text-slate-500">Todo #{id} (not found)</span>
                  <button
                    onClick={() => updateMutation.mutate({ blocked_by_ids: todo.blocked_by_ids.filter((bid: number) => bid !== id) })}
                    className="flex-shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors text-lg leading-none px-1"
                  >×</button>
                </li>
              ))}
          </ul>
        )}
        <BlockerPicker
          allTodos={allTodos}
          excludeId={todoId}
          selectedIds={todo.blocked_by_ids}
          onSelect={(t) => updateMutation.mutate({ blocked_by_ids: [...todo.blocked_by_ids, t.id] })}
          onCreate={(title) => createTodo({ title }).then((newTodo) => updateMutation.mutate({ blocked_by_ids: [...todo.blocked_by_ids, newTodo.id] }))}
        />
      </div>

      {/* Blocking others */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">
          Blocking
        </h2>
        {blocking.length > 0 && (
          <ul className="space-y-2 mb-1">
            {blocking.map((blocked) => (
              <BlockingTreeNode
                key={blocked.id}
                todo={blocked}
                allTodos={allTodos}
                onOpenTodo={onOpenTodo}
                onRemove={() => updateTodo(blocked.id, { blocked_by_ids: blocked.blocked_by_ids.filter((id) => id !== todoId) }).then(invalidate)}
                visited={new Set([todoId])}
              />
            ))}
          </ul>
        )}
        <BlockerPicker
          allTodos={allTodos}
          excludeId={todoId}
          selectedIds={blocking.map((t) => t.id)}
          onSelect={(t) => updateTodo(t.id, { blocked_by_ids: [...t.blocked_by_ids, todoId] }).then(invalidate)}
          onCreate={(title) => createTodo({ title, blocked_by_ids: [todoId] }).then(() => invalidate())}
        />
      </div>

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
