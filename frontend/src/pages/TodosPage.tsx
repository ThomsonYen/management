import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTodo, fetchTodos, fetchPersons, fetchProjects, updateTodo } from '../api'
import type { Todo, Person, Project } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import { useTodoDefaults } from '../TodoDefaultsContext'
import { useTimezone } from '../TimezoneContext'
import { getTodayString } from '../dateUtils'
import { useHotkeys } from '../HotkeysContext'
import { useHotkey } from '../hooks/useHotkey'

const STATUS_OPTIONS = ['', 'todo', 'in-progress', 'blocked']
const IMPORTANCE_OPTIONS = ['', 'low', 'medium', 'high', 'critical']

function AddTodoCard({
  defaultAssigneeId,
  defaultProjectId,
  defaultStatus,
  defaultImportance,
}: {
  defaultAssigneeId?: number
  defaultProjectId?: number
  defaultStatus?: string
  defaultImportance?: string
}) {
  const [title, setTitle] = useState('')
  const queryClient = useQueryClient()
  const { defaults } = useTodoDefaults()
  const { timezone } = useTimezone()

  const createMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setTitle('')
    },
  })

  const handleSubmit = () => {
    if (!title.trim() || createMutation.isPending) return
    const assignee = defaultAssigneeId ?? (defaults.assigneeId ? parseInt(defaults.assigneeId) : null)
    createMutation.mutate({
      title: title.trim(),
      assignee_id: assignee,
      project_id: defaultProjectId,
      status: defaultStatus || 'todo',
      importance: defaultImportance || defaults.importance,
      estimated_hours: parseFloat(defaults.estimatedHours) || 1,
      deadline: defaults.deadlineToToday ? getTodayString(timezone) : undefined,
      blocked_by_ids: [],
    })
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-dashed border-slate-300 dark:border-slate-600 overflow-hidden">
      <div className="px-5 py-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder={createMutation.isPending ? 'Adding...' : '+ Add a todo...'}
          disabled={createMutation.isPending}
          className="w-full text-sm font-medium text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-500 bg-transparent outline-none disabled:opacity-50"
        />
      </div>
    </div>
  )
}

export default function TodosPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedPerson = searchParams.get('person') ?? ''
  const selectedProject = searchParams.get('project') ?? ''
  const selectedStatus = searchParams.get('status') ?? ''
  const selectedImportance = searchParams.get('importance') ?? ''
  const setParam = (key: string, value: string) =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); value ? p.set(key, value) : p.delete(key); return p })
  const setSelectedPerson = (v: string) => setParam('person', v)
  const setSelectedProject = (v: string) => setParam('project', v)
  const setSelectedStatus = (v: string) => setParam('status', v)
  const setSelectedImportance = (v: string) => setParam('importance', v)
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const queryClient = useQueryClient()
  const { bindings } = useHotkeys()

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: persons = [] } = useQuery<Person[]>({
    queryKey: ['persons'],
    queryFn: fetchPersons,
  })
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })
  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ['todos', selectedPerson, selectedProject, selectedStatus],
    queryFn: () =>
      fetchTodos({
        assignee_id: selectedPerson ? parseInt(selectedPerson) : undefined,
        project_id: selectedProject ? parseInt(selectedProject) : undefined,
        status: selectedStatus || undefined,
        exclude_done: true,
      }),
  })

  const filtered = selectedImportance
    ? todos.filter((t) => t.importance === selectedImportance)
    : todos

  // --- Hotkeys ---
  const markDoneMutation = useMutation({
    mutationFn: (id: number) => updateTodo(id, { status: 'done' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  })
  const toggleFocusMutation = useMutation({
    mutationFn: ({ id, focused }: { id: number; focused: boolean }) => updateTodo(id, { is_focused: !focused }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
  })

  // ⌘D — mark selected todos done
  useHotkey(bindings.markDone, useCallback(() => {
    if (selectedIds.size === 0) return
    selectedIds.forEach((id) => markDoneMutation.mutate(id))
    setSelectedIds(new Set())
  }, [selectedIds, markDoneMutation]))

  // ⌘F — toggle focus on selected todos
  useHotkey(bindings.toggleFocus, useCallback(() => {
    if (selectedIds.size === 0) return
    selectedIds.forEach((id) => {
      const todo = filtered.find((t) => t.id === id)
      if (todo) toggleFocusMutation.mutate({ id, focused: todo.is_focused })
    })
  }, [selectedIds, filtered, toggleFocusMutation]))

  // ⌘E — edit first selected todo
  useHotkey(bindings.editTodo, useCallback(() => {
    if (selectedIds.size !== 1) return
    const id = [...selectedIds][0]
    const todo = filtered.find((t) => t.id === id)
    if (todo) { setEditingTodo(todo); setShowModal(true) }
  }, [selectedIds, filtered]))

  // ⌘A — select all visible todos
  useHotkey(bindings.selectAll, useCallback(() => {
    setSelectedIds(new Set(filtered.map((t) => t.id)))
  }, [filtered]))

  // Escape — clear selection or close modal
  useHotkey(bindings.escape, useCallback(() => {
    if (showModal) { setShowModal(false); setEditingTodo(null) }
    else if (selectedIds.size > 0) setSelectedIds(new Set())
  }, [showModal, selectedIds]), { skipInputCheck: true })

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingTodo(null)
  }

  // Resolve filter IDs to pass as defaults for AddTodoCard
  const defaultAssigneeId = selectedPerson ? parseInt(selectedPerson) : undefined
  const defaultProjectId = selectedProject ? parseInt(selectedProject) : undefined
  const defaultStatus = selectedStatus || undefined
  const defaultImportance = selectedImportance || undefined

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Todos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + Add Todo
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Person
            </label>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All people</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o ? o.charAt(0).toUpperCase() + o.slice(1) : 'All statuses'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Importance
            </label>
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {IMPORTANCE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o ? o.charAt(0).toUpperCase() + o.slice(1) : 'All importance'}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(selectedPerson || selectedProject || selectedStatus || selectedImportance) && (
          <button
            onClick={() => setSearchParams({})}
            className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        {filtered.length} todo{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Todo list */}
      {isLoading ? (
        <div className="text-slate-500 dark:text-slate-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TodoCard
              key={t.id}
              todo={t}
              onEdit={handleEdit}
              onOpenDetail={() => onOpenTodo(t.id)}
              queryKeys={[['todos']]}
              isSelected={selectedIds.has(t.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
          <AddTodoCard
            defaultAssigneeId={defaultAssigneeId}
            defaultProjectId={defaultProjectId}
            defaultStatus={defaultStatus}
            defaultImportance={defaultImportance}
          />
        </div>
      )}

      <BulkActionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds(new Set())}
        queryKeys={[['todos']]}
      />

      {showModal && (
        <TodoModal
          todo={editingTodo}
          onClose={handleCloseModal}
          invalidateKeys={[['todos']]}
        />
      )}
    </div>
  )
}
