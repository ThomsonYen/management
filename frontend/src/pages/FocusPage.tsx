import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTodos, fetchProjects, updateTodo, createTodo } from '../api'
import type { Todo, Project } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'

export default function FocusPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [newTitle, setNewTitle] = useState('')
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
      const todo = await createTodo({ title, status: 'todo', importance: 'medium', estimated_hours: 1 })
      await updateTodo(todo.id, { is_focused: true })
      return todo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setNewTitle('')
    },
  })

  const notDone = todos.filter((t) => t.status !== 'done')

  const filtered = selectedProject
    ? selectedProject === 'none'
      ? notDone.filter((t) => !t.project_id)
      : notDone.filter((t) => t.project_id === parseInt(selectedProject))
    : notDone

  // Group by project
  const grouped = filtered.reduce<Record<string, Todo[]>>((acc, t) => {
    const key = t.project_name || 'No Project'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  // Sort groups: named projects first (alphabetical), then "No Project"
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    if (a === 'No Project') return 1
    if (b === 'No Project') return -1
    return a.localeCompare(b)
  })

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Focus</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Drag any todo card onto "Focus" in the sidebar to add it here
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
        <div className="space-y-6">
          {sortedGroups.map(([projectName, projectTodos]) => (
            <div key={projectName}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {projectName}
                </span>
                <span className="text-xs text-slate-400">
                  ({projectTodos.length})
                </span>
              </div>
              <div className="space-y-3">
                {projectTodos.map((t) => (
                  <TodoCard
                    key={t.id}
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
                ))}
              </div>
            </div>
          ))}
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
