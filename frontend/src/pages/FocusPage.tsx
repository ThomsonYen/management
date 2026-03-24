import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTodos, fetchProjects, updateTodo, createTodo, reorderFocus } from '../api'
import type { Todo, Project } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'

type GroupBy = 'none' | 'project' | 'user' | 'both'

function groupTodos(todos: Todo[], groupBy: GroupBy): { key: string; label: string; todos: Todo[] }[] {
  if (groupBy === 'none') return [{ key: '_all', label: '', todos }]

  const getGroupKey = (t: Todo): string => {
    if (groupBy === 'project') return t.project_name || 'No Project'
    if (groupBy === 'user') return t.assignee_name || 'Unassigned'
    return `${t.project_name || 'No Project'} / ${t.assignee_name || 'Unassigned'}`
  }

  const map = new Map<string, Todo[]>()
  for (const t of todos) {
    const key = getGroupKey(t)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }

  // Sort groups by the minimum focus_order in each group
  return [...map.entries()]
    .sort((a, b) => a[1][0].focus_order - b[1][0].focus_order)
    .map(([key, items]) => ({ key, label: key, todos: items }))
}

export default function FocusPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const saved = localStorage.getItem('focusGroupBy')
    return (saved === 'project' || saved === 'user' || saved === 'both') ? saved : 'none'
  })
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItemId = useRef<number | null>(null)
  const queryClient = useQueryClient()

  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ['todos', { is_focused: true }],
    queryFn: () => fetchTodos({ is_focused: true }),
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  const removeFocus = useMutation({
    mutationFn: (id: number) => updateTodo(id, { is_focused: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const addFocusedTodo = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = todos.reduce((max, t) => Math.max(max, t.focus_order), 0)
      const todo = await createTodo({ title, status: 'todo', importance: 'medium', estimated_hours: 1 })
      await updateTodo(todo.id, { is_focused: true, focus_order: maxOrder + 1 })
      return todo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setNewTitle('')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: reorderFocus,
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: ['todos', { is_focused: true }] })
      const previous = queryClient.getQueryData<Todo[]>(['todos', { is_focused: true }])
      // Optimistically update the cache
      queryClient.setQueryData<Todo[]>(['todos', { is_focused: true }], (old) => {
        if (!old) return old
        const orderMap = new Map(items.map((item) => [item.id, item.focus_order]))
        return old.map((t) => {
          const newOrder = orderMap.get(t.id)
          return newOrder !== undefined ? { ...t, focus_order: newOrder } : t
        })
      })
      return { previous }
    },
    onError: (_err, _items, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['todos', { is_focused: true }], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const notDone = todos
    .filter((t) => t.status !== 'done')
    .sort((a, b) => a.focus_order - b.focus_order)

  const filtered = selectedProject
    ? selectedProject === 'none'
      ? notDone.filter((t) => !t.project_id)
      : notDone.filter((t) => t.project_id === parseInt(selectedProject))
    : notDone

  // Projects that appear in focused todos (for filter dropdown)
  const focusedProjectIds = [...new Set(todos.map((t) => t.project_id).filter(Boolean))]
  const focusedProjects = projects.filter((p) => focusedProjectIds.includes(p.id))

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingTodo(null)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDragStart = useCallback((todoId: number) => {
    dragItemId.current = todoId
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    // Don't set dropEffect — TodoCard uses effectAllowed='link', and mismatching causes drop rejection
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverIndex(null)

      const draggedId = dragItemId.current ?? parseInt(e.dataTransfer.getData('application/x-todo-id'))
      if (!draggedId) return

      const dragIndex = filtered.findIndex((t) => t.id === draggedId)
      if (dragIndex === -1 || dragIndex === dropIndex) return

      // Adjust dropIndex: if dragging down, account for the removed item
      const adjustedDrop = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      if (dragIndex === adjustedDrop) return

      const reordered = [...filtered]
      const [moved] = reordered.splice(dragIndex, 1)
      reordered.splice(adjustedDrop, 0, moved)

      const items = reordered.map((t, i) => ({ id: t.id, focus_order: i }))
      reorderMutation.mutate(items)
      dragItemId.current = null
    },
    [filtered, reorderMutation],
  )

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null)
    dragItemId.current = null
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Focus</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Drag cards to reorder. Drag any todo onto "Focus" in the sidebar to add it here.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      {focusedProjects.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-6">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Filter by project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All projects</option>
              {focusedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {todos.some((t) => !t.project_id) && (
                <option value="none">No Project</option>
              )}
            </select>
            {selectedProject && (
              <button
                onClick={() => setSelectedProject('')}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Group by + Count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {filtered.length} focused todo{filtered.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Group by
          </label>
          <select
            value={groupBy}
            onChange={(e) => {
              const v = e.target.value as GroupBy
              setGroupBy(v)
              localStorage.setItem('focusGroupBy', v)
            }}
            className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="none">None</option>
            <option value="project">Project</option>
            <option value="user">User</option>
            <option value="both">Project &amp; User</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 dark:text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            No focused todos yet. Drag todo cards onto "Focus" in the sidebar to add them.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {groupTodos(filtered, groupBy).map((group) => (
            <div key={group.key}>
              {groupBy !== 'none' && (
                <div className="flex items-center gap-3 mt-6 mb-3 px-1">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {group.label}
                  </h3>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {group.todos.length}
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
              )}
              {group.todos.map((t) => {
                const globalIndex = filtered.indexOf(t)
                return (
                  <div
                    key={t.id}
                    onDragOver={(e) => handleDragOver(e, globalIndex)}
                    onDrop={(e) => handleDrop(e, globalIndex)}
                    onDragEnd={handleDragEnd}
                    onDragStartCapture={() => handleDragStart(t.id)}
                  >
                    {dragOverIndex === globalIndex && dragItemId.current !== null && dragItemId.current !== t.id && (
                      <div className="h-1 bg-indigo-400 rounded-full mx-2 mb-1 transition-all" />
                    )}
                    <div className="mb-2">
                      <TodoCard
                        todo={t}
                        onEdit={handleEdit}
                        onOpenDetail={() => onOpenTodo(t.id)}
                        queryKeys={[['todos'], ['todos', { is_focused: true }]]}
                        isSelected={selectedIds.has(t.id)}
                        onToggleSelect={toggleSelect}
                        extraActions={
                          <button
                            onClick={() => removeFocus.mutate(t.id)}
                            title="Remove from Focus"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                          >
                            ✕ Deprio
                          </button>
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {/* Drop zone at the end */}
          <div
            onDragOver={(e) => handleDragOver(e, filtered.length)}
            onDrop={(e) => handleDrop(e, filtered.length)}
            className="h-4"
          >
            {dragOverIndex === filtered.length && dragItemId.current !== null && (
              <div className="h-1 bg-indigo-400 rounded-full mx-2 transition-all" />
            )}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-dashed border-slate-300 dark:border-slate-600 overflow-hidden">
            <div className="px-5 py-4">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim() && !addFocusedTodo.isPending) {
                    addFocusedTodo.mutate(newTitle.trim())
                  }
                }}
                placeholder={addFocusedTodo.isPending ? 'Adding...' : '+ Add a focused todo...'}
                disabled={addFocusedTodo.isPending}
                className="w-full text-sm font-medium text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-500 bg-transparent outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}

      <BulkActionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds(new Set())}
        queryKeys={[['todos'], ['todos', { is_focused: true }]]}
      />

      {showModal && (
        <TodoModal
          todo={editingTodo}
          onClose={handleCloseModal}
          invalidateKeys={[['todos'], ['todos', { is_focused: true }]]}
        />
      )}
    </div>
  )
}
