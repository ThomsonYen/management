import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTodos, fetchProjects, updateTodo, createTodo, reorderFocus } from '../api'
import type { Todo, Project } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'

export default function FocusPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [newTitle, setNewTitle] = useState('')
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
          <h2 className="text-2xl font-bold text-slate-800">Focus</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Drag cards to reorder. Drag any todo onto "Focus" in the sidebar to add it here.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      {focusedProjects.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Filter by project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

      {/* Count */}
      <p className="text-sm text-slate-500 mb-3">
        {filtered.length} focused todo{filtered.length !== 1 ? 's' : ''}
      </p>

      {isLoading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-400 text-sm">
            No focused todos yet. Drag todo cards onto "Focus" in the sidebar to add them.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((t, index) => (
            <div
              key={t.id}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onDragStartCapture={() => handleDragStart(t.id)}
            >
              {dragOverIndex === index && dragItemId.current !== null && dragItemId.current !== t.id && (
                <div className="h-1 bg-indigo-400 rounded-full mx-2 mb-1 transition-all" />
              )}
              <div className="mb-2">
                <TodoCard
                  todo={t}
                  onEdit={handleEdit}
                  onOpenDetail={() => onOpenTodo(t.id)}
                  queryKeys={[['todos'], ['todos', { is_focused: true }]]}
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
          <div className="bg-white rounded-xl shadow-sm border border-dashed border-slate-300 overflow-hidden">
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
                className="w-full text-sm font-medium text-slate-600 placeholder-slate-300 bg-transparent outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}

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
