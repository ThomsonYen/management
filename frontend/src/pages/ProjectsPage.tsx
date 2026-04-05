import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResizableSidebar } from '../hooks/useResizableSidebar'
import { useHotkeys } from '../HotkeysContext'
import { useHotkey } from '../hooks/useHotkey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import EditableMarkdown from '../components/EditableMarkdown'
import { fetchProjectTree, fetchProjects, fetchTodos, createProject, createTodo, deleteProject, updateProject } from '../api'
import type { ProjectTree, Project, Todo } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import { useTodoDefaults } from '../TodoDefaultsContext'
import { useTimezone } from '../TimezoneContext'
import { getTodayString } from '../dateUtils'

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
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const queryClient = useQueryClient()
  const hasChildren = node.subprojects.length > 0

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateProject(node.id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
      setEditing(false)
    },
  })

  const commitRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== node.name) {
      renameMutation.mutate(trimmed)
    } else {
      setEditName(node.name)
      setEditing(false)
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 group cursor-pointer rounded-lg px-2 py-1.5 text-sm ${
          selectedId === node.id
            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
          className="w-4 flex-shrink-0 text-slate-400 dark:text-slate-500 text-xs"
        >
          {hasChildren ? (open ? '▼' : '▶') : ' '}
        </button>
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditName(node.name); setEditing(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-white dark:bg-slate-700 border border-indigo-400 rounded px-1 py-0 text-sm outline-none"
          />
        ) : (
          <span
            className="flex-1"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditName(node.name)
              setEditing(true)
            }}
          >
            {node.name}
          </span>
        )}
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
          {parentId ? 'Add Subproject' : 'Add Project'}
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function AddTodoCard({ projectId, queryKeys }: { projectId: number; queryKeys: unknown[][] }) {
  const [title, setTitle] = useState('')
  const queryClient = useQueryClient()
  const { defaults } = useTodoDefaults()
  const { timezone } = useTimezone()

  const createMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      queryKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
      setTitle('')
    },
  })

  const handleSubmit = () => {
    if (!title.trim() || createMutation.isPending) return
    createMutation.mutate({
      title: title.trim(),
      assignee_id: defaults.assigneeId ? parseInt(defaults.assigneeId) : null,
      project_id: projectId,
      status: 'todo',
      importance: defaults.importance,
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
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder={createMutation.isPending ? 'Adding...' : '+ Add a todo...'}
          disabled={createMutation.isPending}
          className="w-full text-sm font-medium text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-500 bg-transparent outline-none disabled:opacity-50"
        />
      </div>
    </div>
  )
}

function ProjectNotes({ project }: { project: Project }) {
  const [draft, setDraft] = useState(project.notes || '')
  const [showRaw, setShowRaw] = useState(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const serverNotes = project.notes || ''
    if (serverNotes !== draftRef.current) {
      setDraft(serverNotes)
    }
  }, [project.id, project.notes])

  const saveMutation = useMutation({
    mutationFn: (notes: string) => updateProject(project.id, { notes: notes || undefined }),
  })

  const handleChange = useCallback((md: string) => {
    setDraft(md)
  }, [])

  const handleSave = useCallback((md: string) => {
    saveMutation.mutate(md)
  }, [saveMutation])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Notes</h3>
        <button
          onClick={() => setShowRaw(v => !v)}
          className="text-[10px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {showRaw ? 'Hide raw' : 'Raw'}
        </button>
      </div>
      {draft ? (
        <EditableMarkdown value={draft} onChange={handleChange} onSave={handleSave} />
      ) : (
        <p
          onClick={() => setDraft(' ')}
          className="text-sm text-slate-400 dark:text-slate-500 italic cursor-text"
        >
          Click to add notes...
        </p>
      )}
      {showRaw && (
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); saveMutation.mutate(e.target.value) }}
          rows={8}
          className="mt-3 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
      )}
    </div>
  )
}

export default function ProjectsPage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const queryClient = useQueryClient()
  const { width: panelWidth, collapsed: panelCollapsed, startResize: startPanelResize, toggleCollapsed: togglePanel } = useResizableSidebar('projectsPanelWidth', 256)
  const { bindings } = useHotkeys()
  const stableTogglePanel = useCallback(() => togglePanel(), [togglePanel])
  useHotkey(bindings.toggleSecondarySidebar, stableTogglePanel)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedProjectId = searchParams.get('project') ? Number(searchParams.get('project')) : null
  const setSelectedProjectId = (id: number | null) =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); id ? p.set('project', String(id)) : p.delete('project'); return p })
  const [showAddProject, setShowAddProject] = useState(false)
  const [addSubParentId, setAddSubParentId] = useState<number | null>(null)
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
    queryFn: () => fetchTodos({ project_id: selectedProjectId!, exclude_done: true }),
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
  const [editingName, setEditingName] = useState(false)
  const [detailName, setDetailName] = useState('')

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateProject(selectedProjectId!, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
      setEditingName(false)
    },
  })

  const commitDetailRename = () => {
    const trimmed = detailName.trim()
    if (trimmed && trimmed !== selectedProject?.name) {
      renameMutation.mutate(trimmed)
    } else {
      setEditingName(false)
    }
  }

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
      <div
        style={{ width: panelCollapsed ? 40 : panelWidth }}
        className="relative bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 transition-[width] duration-200"
      >
        {panelCollapsed ? (
          <div className="flex flex-col items-center flex-1 justify-end py-3">
            <button
              onClick={togglePanel}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              title="Expand projects panel"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Projects</h3>
              <button
                onClick={() => setShowAddProject(true)}
                className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
              >
                + New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {tree.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">No projects yet</p>
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
            <div className="px-2 py-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={togglePanel}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Collapse projects panel"
              >
                <ChevronsLeft size={16} />
                <span className="text-xs">Collapse</span>
              </button>
            </div>
            <div
              onMouseDown={startPanelResize}
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500/50 transition-colors"
            />
          </>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedProjectId ? (
          <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500 text-sm">
            Select a project to view its todos
          </div>
        ) : (
          <>
            {selectedProject && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {editingName ? (
                      <input
                        autoFocus
                        value={detailName}
                        onChange={(e) => setDetailName(e.target.value)}
                        onBlur={commitDetailRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitDetailRename()
                          if (e.key === 'Escape') setEditingName(false)
                        }}
                        className="text-xl font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 border border-indigo-400 rounded px-1 outline-none"
                      />
                    ) : (
                      <h2
                        className="text-xl font-bold text-slate-800 dark:text-slate-100 cursor-text select-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailName(selectedProject.name)
                          setEditingName(true)
                        }}
                      >
                        {selectedProject.name}
                      </h2>
                    )}
                    {selectedProject.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{selectedProject.description}</p>
                    )}
                    {selectedProject.deadline && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
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

            {selectedProject && <ProjectNotes project={selectedProject} />}

            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">
              Todos ({projectTodos.length})
            </h3>
            {todosLoading ? (
              <div className="text-slate-500 dark:text-slate-400 text-sm">Loading...</div>
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
                    isSelected={selectedIds.has(t.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                <AddTodoCard projectId={selectedProjectId} queryKeys={todoQueryKeys} />
              </div>
            )}
          </>
        )}
        <BulkActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds(new Set())}
          queryKeys={todoQueryKeys}
        />
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
