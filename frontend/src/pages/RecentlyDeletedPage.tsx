import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Folder, Undo2, User, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
 fetchDeletedTodos,
 fetchDeletedProjects,
 fetchProjects,
 undeprecateProject,
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

 // Deprecated projects live here rather than in the project list. Only the top
 // of each deprecated subtree is listed: reactivating it brings back the rest.
 const { data: allProjects = [], isLoading: deprecatedLoading } = useQuery<Project[]>({
 queryKey: ['projects'],
 queryFn: fetchProjects,
 })
 const deprecated = useMemo(() => {
 const byId = new Map(allProjects.map((p) => [p.id, p]))
 const isDeprecated = (id: number | null | undefined) => id != null && !!byId.get(id)?.deprecated_at
 const subCount = (id: number): number =>
 allProjects.filter((c) => c.parent_id === id).reduce((n, c) => n + 1 + subCount(c.id), 0)
 return allProjects
 .filter((p) => p.deprecated_at && !isDeprecated(p.parent_id))
 .sort((a, b) => (b.deprecated_at ?? '').localeCompare(a.deprecated_at ?? ''))
 .map((p) => ({ project: p, subprojects: subCount(p.id) }))
 }, [allProjects])

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

 const reactivateMut = useMutation({
 mutationFn: undeprecateProject,
 onSuccess: (project) => {
 invalidateAll()
 showToast({ message: `Reactivated project "${project.name}"`, tone: 'success' })
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

 const projectCount = deprecated.length + projects.length
 const isEmpty = tab === 'todos' ? todos.length === 0 : projectCount === 0
 const isLoading = tab === 'todos' ? todosLoading : projectsLoading || deprecatedLoading

 return (
 <div className="p-4 md:p-6 max-w-3xl mx-auto">
 <div className="mb-6">
 <h1 className="text-xl font-bold text-fg">Recently Deleted</h1>
 <p className="text-sm text-fg-muted mt-0.5">
 Deprecated projects and deleted items can be brought back here. Nothing is removed until you delete it forever.
 </p>
 </div>

 <div className="flex gap-1 mb-4 border-b border-border">
 {(['todos', 'projects'] as const).map((t) => {
 const count = t === 'todos' ? todos.length : projectCount
 return (
 <button
 key={t}
 onClick={() => setTab(t)}
 className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
 tab === t
 ? 'border-accent text-accent'
 : 'border-transparent text-fg-muted hover:text-fg dark:hover:text-fg'
 }`}
 >
 {t} {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
 </button>
 )
 })}
 </div>

 {isLoading && <p className="text-fg-subtle text-sm">Loading...</p>}

 {!isLoading && isEmpty && (
 <div className="bg-surface rounded-xl border border-border shadow-sm p-10 text-center">
 <p className="text-fg-subtle text-sm">
 {tab === 'todos' ? 'No deleted todos yet.' : 'No deprecated or deleted projects yet.'}
 </p>
 </div>
 )}

 {!isLoading && !isEmpty && (
 <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
 {tab === 'todos' &&
 todos.map((todo, idx) => (
 <div
 key={todo.id}
 className={`flex items-center gap-3 px-5 py-3.5 ${
 idx < todos.length - 1 ? 'border-b border-border-subtle' : ''
 }`}
 >
 <X size={14} className="text-fg-faint dark:text-fg-muted flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-fg truncate">
 {todo.title}
 </p>
 <div className="flex items-center gap-2 mt-0.5 text-xs text-fg-subtle">
 {todo.assignee_name && <span className="inline-flex items-center gap-1"><User size={12} className="shrink-0" />{todo.assignee_name}</span>}
 {todo.project_name && <span className="inline-flex items-center gap-1"><Folder size={12} className="shrink-0" />{todo.project_name}</span>}
 <span>deleted {timeAgo(todo.deleted_at)}</span>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <button
 onClick={() => restoreTodoMut.mutate(todo.id)}
 disabled={restoreTodoMut.isPending}
 className="text-xs px-2.5 py-1 rounded-lg bg-accent-1 text-accent-fg dark:text-accent border border-accent-2 dark:border-accent-active hover:bg-accent-2 dark:hover:bg-accent-active transition-colors font-medium disabled:opacity-40"
 >
 <Undo2 size={12} className="inline-block shrink-0 align-[-0.15em] mr-1" />Restore
 </button>
 <button
 onClick={() => onPurgeTodo(todo)}
 disabled={purgeTodoMut.isPending}
 className="text-xs px-2.5 py-1 rounded-lg bg-danger-bg text-danger border border-danger/30 hover:bg-danger/20 transition-colors font-medium disabled:opacity-40"
 >
 Delete forever
 </button>
 </div>
 </div>
 ))}

 {tab === 'projects' &&
 deprecated.map(({ project, subprojects }) => (
 <div key={project.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border-subtle last:border-b-0">
 <Archive size={14} className="text-fg-subtle flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <Link
 to={`/projects?project=${project.id}`}
 className="block text-sm font-medium text-fg truncate hover:text-accent-fg hover:underline"
 title="Open project (its todos and notes are kept)"
 >
 {project.name}
 </Link>
 <div className="flex items-center gap-2 mt-0.5 text-xs text-fg-subtle">
 {subprojects > 0 && <span>+{subprojects} subproject{subprojects === 1 ? '' : 's'}</span>}
 <span>deprecated {timeAgo(project.deprecated_at ?? undefined)}</span>
 </div>
 </div>
 <button
 onClick={() => reactivateMut.mutate(project.id)}
 disabled={reactivateMut.isPending}
 className="text-xs px-2.5 py-1 rounded-lg bg-accent-1 text-accent-fg dark:text-accent border border-accent-2 dark:border-accent-active hover:bg-accent-2 dark:hover:bg-accent-active transition-colors font-medium disabled:opacity-40 flex-shrink-0"
 >
 <Undo2 size={12} className="inline-block shrink-0 align-[-0.15em] mr-1" />Reactivate
 </button>
 </div>
 ))}

 {tab === 'projects' &&
 projects.map((project) => (
 <div
 key={project.id}
 className="flex items-center gap-3 px-5 py-3.5 border-b border-border-subtle last:border-b-0"
 >
 <X size={14} className="text-fg-faint dark:text-fg-muted flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-fg truncate">
 {project.name}
 </p>
 <div className="flex items-center gap-2 mt-0.5 text-xs text-fg-subtle">
 {project.description && <span className="truncate">{project.description}</span>}
 <span>deleted {timeAgo(project.deleted_at)}</span>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <button
 onClick={() => restoreProjectMut.mutate(project.id)}
 disabled={restoreProjectMut.isPending}
 className="text-xs px-2.5 py-1 rounded-lg bg-accent-1 text-accent-fg dark:text-accent border border-accent-2 dark:border-accent-active hover:bg-accent-2 dark:hover:bg-accent-active transition-colors font-medium disabled:opacity-40"
 >
 <Undo2 size={12} className="inline-block shrink-0 align-[-0.15em] mr-1" />Restore
 </button>
 <button
 onClick={() => onPurgeProject(project)}
 disabled={purgeProjectMut.isPending}
 className="text-xs px-2.5 py-1 rounded-lg bg-danger-bg text-danger border border-danger/30 hover:bg-danger/20 transition-colors font-medium disabled:opacity-40"
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
