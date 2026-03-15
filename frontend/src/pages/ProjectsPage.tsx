import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchProjectTree, fetchProjects, fetchTodos, createProject, deleteProject } from '../api'
import type { ProjectTree, Project, Todo } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'

function ProjectNode({
  node,
  depth,
  selectedId,
  onSelect,
  onAddSub,
}: {
  node: ProjectTree
  depth: number
  selectedId: number | null
  onSelect: (id: number) => void
  onAddSub: (parentId: number) => void
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.subprojects.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-1 group cursor-pointer rounded-lg px-2 py-1.5 text-sm ${
          selectedId === node.id
            ? 'bg-indigo-100 text-indigo-800 font-semibold'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-4 flex-shrink-0 text-slate-400 text-xs"
        >
          {hasChildren ? (open ? '▼' : '▶') : ' '}
        </button>
        <span className="flex-1" onClick={() => onSelect(node.id)}>
          {node.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAddSub(node.id)
          }}
          className="opacity-0 group-hover:opacity-100 text-indigo-400 hover:text-indigo-700 text-xs px-1 transition-all"
          title="Add subproject"
        >
          +
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.subprojects.map((sp) => (
            <ProjectNode
              key={sp.id}
              node={sp}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddSub={onAddSub}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface AddProjectModalProps {
  parentId?: number | null
  onClose: () => void
}

function AddProjectModal({ parentId, onClose }: AddProjectModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        name,
        description: description || undefined,
        parent_id: parentId || undefined,
        deadline: deadline || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">
          {parentId ? 'Add Subproject' : 'Add Project'}
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProjectsPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const queryClient = useQueryClient()
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [showAddProject, setShowAddProject] = useState(false)
  const [addSubParentId, setAddSubParentId] = useState<number | null>(null)
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)

  const { data: tree = [] } = useQuery<ProjectTree[]>({
    queryKey: ['projects-tree'],
    queryFn: fetchProjectTree,
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  const { data: projectTodos = [], isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ['todos', 'project', selectedProjectId],
    queryFn: () => fetchTodos({ project_id: selectedProjectId! }),
    enabled: !!selectedProjectId,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
      setSelectedProjectId(null)
    },
  })

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const handleAddSub = (parentId: number) => {
    setAddSubParentId(parentId)
  }

  const handleCloseAddProject = () => {
    setShowAddProject(false)
    setAddSubParentId(null)
  }

  const todoQueryKeys: unknown[][] = selectedProjectId
    ? [['todos', 'project', selectedProjectId], ['todos']]
    : [['todos']]

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">Projects</h3>
          <button
            onClick={() => setShowAddProject(true)}
            className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {tree.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">No projects yet</p>
          ) : (
            tree.map((node) => (
              <ProjectNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedProjectId}
                onSelect={setSelectedProjectId}
                onAddSub={handleAddSub}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedProjectId ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            Select a project to view its todos
          </div>
        ) : (
          <>
            {selectedProject && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{selectedProject.name}</h2>
                    {selectedProject.description && (
                      <p className="text-sm text-slate-500 mt-1">{selectedProject.description}</p>
                    )}
                    {selectedProject.deadline && (
                      <p className="text-xs text-slate-400 mt-1">
                        Deadline: <span className="font-medium">{selectedProject.deadline}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowTodoModal(true)}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      + Add Todo
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this project and all its subprojects?')) {
                          deleteMutation.mutate(selectedProjectId)
                        }
                      }}
                      className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
              Todos ({projectTodos.length})
            </h3>
            {todosLoading ? (
              <div className="text-slate-500 text-sm">Loading...</div>
            ) : projectTodos.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
                No todos in this project yet.
              </div>
            ) : (
              <div className="space-y-3">
                {projectTodos.map((t) => (
                  <TodoCard
                    key={t.id}
                    todo={t}
                    onEdit={(todo) => {
                      setEditingTodo(todo)
                      setShowTodoModal(true)
                    }}
                    onOpenDetail={() => onOpenTodo(t.id)}
                    queryKeys={todoQueryKeys}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {(showAddProject || addSubParentId !== null) && (
        <AddProjectModal
          parentId={addSubParentId}
          onClose={handleCloseAddProject}
        />
      )}

      {showTodoModal && (
        <TodoModal
          todo={editingTodo}
          onClose={() => {
            setShowTodoModal(false)
            setEditingTodo(null)
          }}
          invalidateKeys={todoQueryKeys}
        />
      )}
    </div>
  )
}
