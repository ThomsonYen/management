import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTodo, fetchTodos, fetchPersons, fetchProjects, updateTodo } from '../api'
import type { Todo, Person, Project } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import { useTodoDefaults, useTimezone, useHotkeys, resolveAssigneeId } from '../SettingsContext'
import { getTodayString } from '../dateUtils'
import { useHotkey } from '../hooks/useHotkey'
import { useUnfocusWithUndo } from '../hooks/useUnfocusWithUndo'
import { useFollowupActions } from '../hooks/useFollowupActions'

const STATUS_OPTIONS = ['', 'todo', 'blocked']
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
 const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })

 const createMutation = useMutation({
 mutationFn: createTodo,
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['todos'] })
 setTitle('')
 },
 })

 const handleSubmit = () => {
 if (!title.trim() || createMutation.isPending) return
 const assignee = defaultAssigneeId ?? resolveAssigneeId(defaults.assigneeName, persons)
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
 <div className="bg-surface rounded-xl shadow-sm border border-dashed border-border overflow-hidden">
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
 className="w-full text-sm font-medium text-fg-muted placeholder:text-fg-faint dark:placeholder:text-fg-faint bg-transparent outline-none disabled:opacity-50"
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
 const selectedKind = searchParams.get('kind') ?? ''
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

 const byImportance = selectedImportance
 ? todos.filter((t) => t.importance === selectedImportance)
 : todos
 const followupCount = byImportance.filter((t) => t.is_followup).length
 const filtered = selectedKind === 'followup'
 ? byImportance.filter((t) => t.is_followup)
 : selectedKind === 'todo'
 ? byImportance.filter((t) => !t.is_followup)
 : byImportance
 const { toFollowup, toTodo } = useFollowupActions()

 // --- Hotkeys ---
 const markDoneMutation = useMutation({
 mutationFn: (id: number) => updateTodo(id, { status: 'done' }),
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
 })
 const focusMutation = useMutation({
 mutationFn: (id: number) => updateTodo(id, { is_focused: true }),
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
 })
 const unfocusWithUndo = useUnfocusWithUndo()

 // ⌘D — mark selected todos done
 useHotkey(bindings.markDone, useCallback(() => {
 if (selectedIds.size === 0) return
 selectedIds.forEach((id) => markDoneMutation.mutate(id))
 setSelectedIds(new Set())
 }, [selectedIds, markDoneMutation]))

 // ⌘F — toggle focus on selected todos
 useHotkey(bindings.toggleFocus, useCallback(() => {
 if (selectedIds.size === 0) return
 const selected = filtered.filter((t) => selectedIds.has(t.id))
 selected.filter((t) => !t.is_focused && !t.is_followup).forEach((t) => focusMutation.mutate(t.id))
 unfocusWithUndo(selected.filter((t) => t.is_focused))
 }, [selectedIds, filtered, focusMutation, unfocusWithUndo]))

 // W — selected todos become follow-ups; selected follow-ups become todos again
 useHotkey(bindings.toggleFollowup, useCallback(() => {
 if (selectedIds.size === 0) return
 const selected = filtered.filter((t) => selectedIds.has(t.id))
 toFollowup(selected.filter((t) => !t.is_followup))
 toTodo(selected.filter((t) => t.is_followup), false)
 setSelectedIds(new Set())
 }, [selectedIds, filtered, toFollowup, toTodo]))

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
 <div className="p-4 md:p-6 max-w-4xl mx-auto">
 {/* On phones the header's "+" adds a todo, so this row is desktop-only */}
 <div className="hidden md:flex items-center justify-between mb-6">
 <h2 className="text-2xl font-semibold tracking-tight text-fg">Todos</h2>
 <button
 onClick={() => setShowModal(true)}
 className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors"
 >
 + Add Todo
 </button>
 </div>

 {/* Filter bar */}
 <div className="md:bg-surface md:rounded-xl md:border md:border-border md:shadow-sm md:p-4 mb-4 md:mb-6">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
 <div>
 <label className="hidden md:block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Person
 </label>
 <select
 value={selectedPerson}
 onChange={(e) => setSelectedPerson(e.target.value)}
 className="w-full bg-surface border border-border rounded-full md:rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
 <label className="hidden md:block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Project
 </label>
 <select
 value={selectedProject}
 onChange={(e) => setSelectedProject(e.target.value)}
 className="w-full bg-surface border border-border rounded-full md:rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
 <label className="hidden md:block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Status
 </label>
 <select
 value={selectedStatus}
 onChange={(e) => setSelectedStatus(e.target.value)}
 className="w-full bg-surface border border-border rounded-full md:rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 {STATUS_OPTIONS.map((o) => (
 <option key={o} value={o}>
 {o ? o.charAt(0).toUpperCase() + o.slice(1) : 'All statuses'}
 </option>
 ))}
 </select>
 </div>
 <div>
 <label className="hidden md:block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Importance
 </label>
 <select
 value={selectedImportance}
 onChange={(e) => setSelectedImportance(e.target.value)}
 className="w-full bg-surface border border-border rounded-full md:rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 {IMPORTANCE_OPTIONS.map((o) => (
 <option key={o} value={o}>
 {o ? o.charAt(0).toUpperCase() + o.slice(1) : 'All importance'}
 </option>
 ))}
 </select>
 </div>
 </div>
 {(selectedPerson || selectedProject || selectedStatus || selectedImportance || selectedKind) && (
 <button
 onClick={() => setSearchParams({})}
 className="mt-3 text-xs text-accent hover:text-accent-fg font-medium"
 >
 Clear filters
 </button>
 )}
 </div>

 {/* Kind + count */}
 <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
 <p className="text-sm text-fg-muted">
 {filtered.length} {selectedKind === 'followup' ? `follow-up${filtered.length !== 1 ? 's' : ''}` : `todo${filtered.length !== 1 ? 's' : ''}`}
 </p>
 <div role="tablist" aria-label="Kind" className="inline-flex p-0.5 gap-0.5 rounded-full bg-inset border border-border-subtle">
 {([['', 'All', byImportance.length], ['todo', 'Todos', byImportance.length - followupCount], ['followup', 'Follow-ups', followupCount]] as const).map(([k, label, n]) => (
 <button
 key={k}
 role="tab"
 aria-selected={selectedKind === k}
 onClick={() => setParam('kind', k)}
 className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
 selectedKind === k ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
 }`}
 >
 {label} <span className="tabular-nums text-fg-subtle">{n}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Todo list */}
 {isLoading ? (
 <div className="text-fg-muted text-sm">Loading...</div>
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
