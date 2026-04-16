import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchDeletedTodos,
  fetchDeletedProjects,
  restoreTodo,
  restoreProject,
  purgeTodo,
  purgeProject,
} from '../api'
import type { Todo, Project } from '../types'
import { useToast } from '../ToastContext'

function timeAgo(iso: string | undefined): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

type Tab = 'todos' | 'projects'

export default function RecentlyDeletedPage() {
  const [tab, setTab] = useState<Tab>('todos')
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const { data: todos = [], isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ['deleted-todos'],
    queryFn: fetchDeletedTodos,
  })

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['deleted-projects'],
    queryFn: fetchDeletedProjects,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['deleted-todos'] })
    queryClient.invalidateQueries({ queryKey: ['deleted-projects'] })
    queryClient.invalidateQueries({ queryKey: ['todos'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['projects-tree'] })
    queryClient.invalidateQueries({ queryKey: ['recently-done'] })
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
  }

  const restoreTodoMut = useMutation({
    mutationFn: restoreTodo,
    onSuccess: (_, id) => {
      const title = todos.find((t) => t.id === id)?.title ?? 'Todo'
      invalidateAll()
      showToast({ message: `Restored "${title}"`, tone: 'success' })
    },
  })

  const restoreProjectMut = useMutation({
    mutationFn: restoreProject,
    onSuccess: (_, id) => {
      const name = projects.find((p) => p.id === id)?.name ?? 'Project'
      invalidateAll()
      showToast({ message: `Restored project "${name}"`, tone: 'success' })
    },
  })

  const purgeTodoMut = useMutation({
    mutationFn: purgeTodo,
    onSuccess: invalidateAll,
  })

  const purgeProjectMut = useMutation({
    mutationFn: purgeProject,
    onSuccess: invalidateAll,
  })

  const onPurgeTodo = (t: Todo) => {
    if (window.confirm(`Permanently delete "${t.title}"? This cannot be undone.`)) {
      purgeTodoMut.mutate(t.id)
    }
  }

  const onPurgeProject = (p: Project) => {
    if (window.confirm(`Permanently delete project "${p.name}"? This cannot be undone.`)) {
      purgeProjectMut.mutate(p.id)
    }
  }

  const items = tab === 'todos' ? todos : projects
  const isLoading = tab === 'todos' ? todosLoading : projectsLoading

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Recently Deleted</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Deleted items can be restored here. Items are kept indefinitely until purged.
        </p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
        {(['todos', 'projects'] as const).map((t) => {
          const count = t === 'todos' ? todos.length : projects.length
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t} {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
            </button>
          )
        })}
      </div>

      {isLoading && <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>}

      {!isLoading && items.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            No deleted {tab} yet.
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {tab === 'todos' &&
            todos.map((todo, idx) => (
              <div
                key={todo.id}
                className={`flex items-center gap-3 px-5 py-3.5 ${
                  idx < todos.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
                }`}
              >
                <span className="text-slate-300 dark:text-slate-600 flex-shrink-0">✕</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                    {todo.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {todo.assignee_name && <span>◉ {todo.assignee_name}</span>}
                    {todo.project_name && <span>◈ {todo.project_name}</span>}
                    <span>deleted {timeAgo(todo.deleted_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => restoreTodoMut.mutate(todo.id)}
                    disabled={restoreTodoMut.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors font-medium disabled:opacity-40"
                  >
                    ↩ Restore
                  </button>
                  <button
                    onClick={() => onPurgeTodo(todo)}
                    disabled={purgeTodoMut.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors font-medium disabled:opacity-40"
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))}

          {tab === 'projects' &&
            projects.map((project, idx) => (
              <div
                key={project.id}
                className={`flex items-center gap-3 px-5 py-3.5 ${
                  idx < projects.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
                }`}
              >
                <span className="text-slate-300 dark:text-slate-600 flex-shrink-0">✕</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                    {project.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {project.description && <span className="truncate">{project.description}</span>}
                    <span>deleted {timeAgo(project.deleted_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => restoreProjectMut.mutate(project.id)}
                    disabled={restoreProjectMut.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors font-medium disabled:opacity-40"
                  >
                    ↩ Restore
                  </button>
                  <button
                    onClick={() => onPurgeProject(project)}
                    disabled={purgeProjectMut.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors font-medium disabled:opacity-40"
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
