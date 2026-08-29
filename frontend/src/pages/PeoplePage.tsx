import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResizableSidebar } from '../hooks/useResizableSidebar'
import { useHotkeys, useTimezone } from '../SettingsContext'
import { useHotkey } from '../hooks/useHotkey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronLeft, ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight, LayoutGrid, List, Maximize2, Minimize2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useIsDesktop } from '../hooks/useMediaQuery'
import {
 fetchPersons,
 fetchProjects,
 fetchTodos,
 fetchReminders,
 createPerson,
 createTodo,
 deletePerson,
 restorePerson,
 purgePerson,
 fetchArchivedPersons,
 reorderPersons,
 updatePerson,
} from '../api'
import type { Person, Project, Todo, ScheduleStatus } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import CheckInButton from '../components/CheckInButton'
import MarkdownEditor from '../components/MarkdownEditor'
import PersonProjectBoard from '../components/PersonProjectBoard'
import PersonAccessSection from '../components/PersonAccessSection'
import SaveIndicator, { type SaveState } from '../components/SaveIndicator'
import { useDebouncedFn } from '../hooks/useDebouncedFn'
import { useToast } from '../ToastContext'
import { DEFAULT_CHECK_IN_INTERVAL, describeCheckIn, getCheckInState } from '../utils/checkIn'

const STATUS_ORDER = ['todo', 'blocked']

const statusLabel: Record<string, string> = {
 todo: 'To Do',
 blocked: 'Blocked',
}

const statusColor: Record<string, string> = {
 todo: 'text-fg-muted',
 blocked: 'text-danger',
}

function AddPersonModal({ onClose }: { onClose: () => void }) {
 const queryClient = useQueryClient()
 const [name, setName] = useState('')
 const [email, setEmail] = useState('')

 const mutation = useMutation({
 mutationFn: () => createPerson({ name, email: email || undefined }),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['persons'] })
 onClose()
 },
 })

 return (
 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
 <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
 <h3 className="text-lg font-bold text-fg mb-4">Add Person</h3>
 <div className="space-y-3">
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="Name"
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 />
 <input
 type="email"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder="Email (optional)"
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 <div className="flex gap-3 mt-5">
 <button
 onClick={() => mutation.mutate()}
 disabled={!name.trim() || mutation.isPending}
 className="flex-1 bg-accent text-white py-2 rounded-lg font-semibold text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
 >
 {mutation.isPending ? 'Adding...' : 'Add Person'}
 </button>
 <button
 onClick={onClose}
 className="px-4 py-2 bg-inset text-fg rounded-lg font-semibold text-sm hover:bg-inset transition-colors"
 >
 Cancel
 </button>
 </div>
 </div>
 </div>
 )
}

function PersonNotes({ person }: { person: Person }) {
 const queryClient = useQueryClient()
 const initialNotes = person.notes || ''
 const [draft, setDraft] = useState(initialNotes)
 const [lastSaved, setLastSaved] = useState(initialNotes)
 const [showRaw, setShowRaw] = useState(false)
 const draftRef = useRef(draft)
 draftRef.current = draft

 useEffect(() => {
 const serverNotes = person.notes || ''
 setLastSaved(serverNotes)
 if (serverNotes !== draftRef.current) {
 setDraft(serverNotes)
 }
 }, [person.id, person.notes])

 const saveMutation = useMutation({
 mutationFn: async (notes: string) => {
 const updated = await updatePerson(person.id, { notes })
 queryClient.setQueryData<Person[]>(['persons'], (old) =>
 old?.map((p) => (p.id === person.id ? { ...p, notes: updated.notes } : p)),
 )
 return updated
 },
 onSuccess: (_, variables) => setLastSaved(variables),
 })

 const debouncedSave = useDebouncedFn(
 (notes: string) => saveMutation.mutate(notes),
 { idleMs: 500, maxMs: 3000 },
 )

 const handleChange = useCallback((md: string) => {
 setDraft(md)
 }, [])

 const handleSave = useCallback((md: string) => {
 saveMutation.mutate(md)
 }, [saveMutation])

 const handleRawChange = useCallback((md: string) => {
 setDraft(md)
 debouncedSave.call(md)
 }, [debouncedSave])

 const dirty = draft !== lastSaved
 const saveState: SaveState =
 saveMutation.isPending ? 'saving' :
 dirty ? 'unsaved' :
 saveMutation.isSuccess ? 'saved' :
 'idle'

 return (
 <div className="bg-surface rounded-xl border border-border px-4 py-3 mb-3">
 <div className="flex items-center justify-between mb-1.5">
 <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">Notes</h3>
 <div className="flex items-center gap-3">
 <SaveIndicator state={saveState} />
 <button
 onClick={() => setShowRaw(v => !v)}
 className="text-[10px] font-mono text-fg-subtle hover:text-fg-muted dark:hover:text-fg transition-colors"
 >
 {showRaw ? 'Hide raw' : 'Raw'}
 </button>
 </div>
 </div>
 {draft ? (
 <MarkdownEditor value={draft} onChange={handleChange} onSave={handleSave} />
 ) : (
 <p
 onClick={() => setDraft(' ')}
 className="text-sm text-fg-subtle italic cursor-text"
 >
 Click to add notes...
 </p>
 )}
 {showRaw && (
 <textarea
 value={draft}
 onChange={(e) => handleRawChange(e.target.value)}
 rows={8}
 className="mt-2 w-full border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent resize-y"
 />
 )}
 </div>
 )
}

/** Last-contact display, check-in button, and cadence settings for one person. */
function PersonCheckInRow({ person }: { person: Person }) {
 const queryClient = useQueryClient()
 const { timezone } = useTimezone()
 const currentInterval = person.check_in_interval_days ?? DEFAULT_CHECK_IN_INTERVAL
 const [intervalDraft, setIntervalDraft] = useState(String(currentInterval))

 useEffect(() => {
 setIntervalDraft(String(currentInterval))
 }, [person.id, currentInterval])

 const save = useMutation({
 mutationFn: (data: Parameters<typeof updatePerson>[1]) => updatePerson(person.id, data),
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['persons'] }),
 })

 const { state } = getCheckInState(person, timezone)
 const tone = !person.is_direct_report
 ? 'text-fg-muted'
 : state === 'due'
 ? 'text-warning font-medium'
 : state === 'ok'
 ? 'text-fg-muted'
 : 'text-danger font-medium'

 const commitInterval = () => {
 const parsed = Math.round(Number(intervalDraft))
 if (!Number.isFinite(parsed) || parsed < 1) {
 setIntervalDraft(String(currentInterval))
 return
 }
 setIntervalDraft(String(parsed))
 if (parsed !== currentInterval) save.mutate({ check_in_interval_days: parsed })
 }

 return (
 <div className="mt-2 pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
 <div className="flex items-center gap-2 min-w-0">
 <span className={`text-xs truncate ${tone}`}>{describeCheckIn(person, timezone)}</span>
 <CheckInButton person={person} size="xs" />
 </div>
 <div className="flex items-center gap-3 text-xs text-fg-muted">
 <label className="flex items-center gap-1.5 cursor-pointer select-none">
 <input
 type="checkbox"
 checked={!!person.is_direct_report}
 onChange={(e) => save.mutate({ is_direct_report: e.target.checked })}
 className="accent-accent"
 />
 Direct report
 </label>
 {person.is_direct_report && (
 <span className="flex items-center gap-1">
 every
 <input
 type="number"
 min={1}
 value={intervalDraft}
 onChange={(e) => setIntervalDraft(e.target.value)}
 onBlur={commitInterval}
 onKeyDown={(e) => {
 if (e.key === 'Enter') e.currentTarget.blur()
 if (e.key === 'Escape') setIntervalDraft(String(currentInterval))
 }}
 className="w-12 border border-border rounded px-1.5 py-0.5 text-xs text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
 />
 days
 </span>
 )}
 </div>
 </div>
 )
}

function PersonProjects({
 person,
 projects,
 onSave,
}: {
 person: Person
 projects: Project[]
 onSave: (project_ids: number[]) => void
}) {
 const [picking, setPicking] = useState(false)
 const assignedIds = person.project_ids ?? []
 const available = projects.filter((p) => !assignedIds.includes(p.id) && !p.deleted_at)
 const projectById = new Map(projects.map((p) => [p.id, p]))

 const add = (pid: number) => {
 onSave([...assignedIds, pid])
 setPicking(false)
 }
 const remove = (pid: number) => {
 onSave(assignedIds.filter((id) => id !== pid))
 }
 const moveToFront = (pid: number) => {
 if (assignedIds[0] === pid) return
 onSave([pid, ...assignedIds.filter((id) => id !== pid)])
 }

 return (
 <div className="bg-surface rounded-xl border border-border px-4 py-2.5 mb-3">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mr-1">Projects</h3>
 {assignedIds.length === 0 && (
 <span className="text-xs italic text-fg-subtle">None — assign to surface in the sidebar</span>
 )}
 {assignedIds.map((pid, i) => {
 const proj = projectById.get(pid)
 if (!proj) return null
 const isPrimary = i === 0
 return (
 <span
 key={pid}
 className={`group inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
 isPrimary
 ? 'bg-accent-1 text-accent-fg font-semibold'
 : 'bg-inset text-fg'
 }`}
 title={isPrimary ? 'Primary affiliation' : 'Click ★ to make primary'}
 >
 {!isPrimary && (
 <button
 onClick={() => moveToFront(pid)}
 className="text-fg-subtle hover:text-warning leading-none"
 title="Make primary"
 >
 ★
 </button>
 )}
 <span className="truncate max-w-[10rem]">{proj.name}</span>
 <button
 onClick={() => remove(pid)}
 className="text-fg-subtle hover:text-danger leading-none"
 title="Remove"
 >
 <X size={11} />
 </button>
 </span>
 )
 })}
 {picking ? (
 <select
 autoFocus
 onBlur={() => setPicking(false)}
 onChange={(e) => {
 const id = Number(e.target.value)
 if (id) add(id)
 }}
 className="text-xs rounded border border-border px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent"
 defaultValue=""
 >
 <option value="" disabled>Pick a project…</option>
 {available.map((p) => (
 <option key={p.id} value={p.id}>{p.name}</option>
 ))}
 </select>
 ) : (
 available.length > 0 && (
 <button
 onClick={() => setPicking(true)}
 className="inline-flex items-center gap-0.5 text-xs text-accent hover:text-accent-fg dark:hover:text-accent font-semibold rounded-full px-2 py-0.5 hover:bg-accent-1 dark:hover:bg-accent-1 transition-colors"
 >
 <Plus size={11} /> Add
 </button>
 )
 )}
 </div>
 </div>
 )
}

function ArchivedPeopleSection({
 onSelect,
}: {
 onSelect: (id: number) => void
}) {
 const queryClient = useQueryClient()
 const { showToast } = useToast()
 const [open, setOpen] = useState(false)

 const { data: archived = [] } = useQuery<Person[]>({
 queryKey: ['persons', 'archived'],
 queryFn: fetchArchivedPersons,
 })

 const invalidate = () => {
 queryClient.invalidateQueries({ queryKey: ['persons'] })
 queryClient.invalidateQueries({ queryKey: ['persons', 'archived'] })
 }

 const restoreMutation = useMutation({
 mutationFn: restorePerson,
 onSuccess: invalidate,
 })

 const purgeMutation = useMutation({
 mutationFn: purgePerson,
 onSuccess: invalidate,
 })

 if (archived.length === 0) return null

 return (
 <div className="border-t border-border">
 <button
 onClick={() => setOpen(v => !v)}
 className="w-full flex items-center justify-between px-4 py-2 text-xs text-fg-muted hover:bg-inset transition-colors"
 >
 <span className="flex items-center gap-1.5">
 {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
 <Archive size={12} />
 Archived
 </span>
 <span className="font-mono text-[11px]">{archived.length}</span>
 </button>
 {open && (
 <div className="pb-1">
 {archived.map((person) => (
 <div
 key={person.id}
 className="group flex items-center justify-between px-4 py-1.5 text-sm text-fg-muted"
 >
 <button
 onClick={() => onSelect(person.id)}
 className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-fg dark:hover:text-fg"
 >
 <div className="w-5 h-5 rounded-full bg-inset text-fg-muted flex items-center justify-center text-[10px] font-bold flex-shrink-0">
 {person.name.charAt(0).toUpperCase()}
 </div>
 <span className="truncate italic">{person.name}</span>
 </button>
 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
 <button
 onClick={() => restoreMutation.mutate(person.id)}
 title="Restore"
 className="p-1 rounded text-fg-subtle hover:text-accent hover:bg-inset"
 >
 <RotateCcw size={12} />
 </button>
 <button
 onClick={() => {
 if (window.confirm(`Permanently delete ${person.name}? This cannot be undone.`)) {
 purgeMutation.mutate(person.id, {
 onSuccess: () => showToast({ message: `Deleted ${person.name} permanently` }),
 })
 }
 }}
 title="Delete permanently"
 className="p-1 rounded text-fg-subtle hover:text-danger hover:bg-inset"
 >
 <Trash2 size={12} />
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )
}

export default function PeoplePage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
 const queryClient = useQueryClient()
 const { showToast } = useToast()
 const { width: panelWidth, collapsed: panelCollapsed, startResize: startPanelResize, toggleCollapsed: togglePanel } = useResizableSidebar('peoplePanelWidth', 256)
 const [panelExpanded, setPanelExpanded] = useState(() => localStorage.getItem('peoplePanelExpanded') === 'true')
 useEffect(() => { localStorage.setItem('peoplePanelExpanded', String(panelExpanded)) }, [panelExpanded])
 const [viewMode, setViewMode] = useState<'list' | 'board'>(() =>
 localStorage.getItem('peopleViewMode') === 'board' ? 'board' : 'list',
 )
 useEffect(() => { localStorage.setItem('peopleViewMode', viewMode) }, [viewMode])
 const togglePanelExpanded = useCallback(() => setPanelExpanded((v) => !v), [])
 const renderedPanelWidth = panelExpanded ? Math.max(panelWidth, 380) : panelWidth
 const isDesktop = useIsDesktop()
 const { bindings } = useHotkeys()
 const { timezone } = useTimezone()
 const stableTogglePanel = useCallback(() => togglePanel(), [togglePanel])
 useHotkey(bindings.toggleSecondarySidebar, stableTogglePanel)
 const [searchParams, setSearchParams] = useSearchParams()
 const selectedPersonId = searchParams.get('person') ? Number(searchParams.get('person')) : null
 const setSelectedPersonId = (id: number | null) =>
 setSearchParams((prev) => { const p = new URLSearchParams(prev); id ? p.set('person', String(id)) : p.delete('person'); return p })
 const [showAddPerson, setShowAddPerson] = useState(false)
 const [showTodoModal, setShowTodoModal] = useState(false)
 const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
 const [newTitle, setNewTitle] = useState('')
 const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

 const invalidatePersons = () => {
 queryClient.invalidateQueries({ queryKey: ['persons'] })
 queryClient.invalidateQueries({ queryKey: ['persons', 'archived'] })
 }

 const [dragId, setDragId] = useState<number | null>(null)
 const [dropIndex, setDropIndex] = useState<number | null>(null)

 const reorderMutation = useMutation({
 mutationFn: reorderPersons,
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['persons'] }),
 })

 const commitReorder = (fromId: number, toIndex: number) => {
 const list = [...persons]
 const fromIndex = list.findIndex((p) => p.id === fromId)
 if (fromIndex === -1 || fromIndex === toIndex) return
 const [moved] = list.splice(fromIndex, 1)
 const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
 list.splice(insertAt, 0, moved)
 const payload = list.map((p, i) => ({ id: p.id, display_order: i + 1 }))
 queryClient.setQueryData<Person[]>(['persons'], list)
 reorderMutation.mutate(payload)
 }

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

 const { data: allTodos = [] } = useQuery<Todo[]>({
 queryKey: ['todos', { exclude_done: true }],
 queryFn: () => fetchTodos({ exclude_done: true }),
 })

 const { data: personTodos = [], isLoading: todosLoading } = useQuery<Todo[]>({
 queryKey: ['todos', 'person', selectedPersonId],
 queryFn: () => fetchTodos({ assignee_id: selectedPersonId!, exclude_done: true }),
 enabled: !!selectedPersonId,
 })

 const { data: reminders = [] } = useQuery<ScheduleStatus[]>({
 queryKey: ['reminders'],
 queryFn: fetchReminders,
 })

 const { data: projects = [] } = useQuery<Project[]>({
 queryKey: ['projects'],
 queryFn: fetchProjects,
 })

 const updatePersonProjects = useMutation({
 mutationFn: ({ id, project_ids }: { id: number; project_ids: number[] }) =>
 updatePerson(id, { project_ids }),
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['persons'] }),
 })

 const archivePersonMutation = useMutation({
 mutationFn: deletePerson,
 onSuccess: (_data, personId) => {
 const archivedName = persons.find((p) => p.id === personId)?.name ?? 'Person'
 invalidatePersons()
 setSelectedPersonId(null)
 showToast({
 message: `Archived ${archivedName}`,
 action: {
 label: 'Undo',
 onClick: async () => {
 await restorePerson(personId)
 invalidatePersons()
 },
 },
 })
 },
 })

 const addTodoForPerson = useMutation({
 mutationFn: (title: string) =>
 createTodo({ title, status: 'todo', importance: 'medium', estimated_hours: 1, assignee_id: selectedPersonId! }),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['todos'] })
 setNewTitle('')
 },
 })

 const todoCountByPerson = allTodos.reduce<Record<number, number>>((acc, t) => {
 if (t.assignee_id) {
 acc[t.assignee_id] = (acc[t.assignee_id] || 0) + 1
 }
 return acc
 }, {})

 const selectedPerson = persons.find((p) => p.id === selectedPersonId)

 const personReminders = selectedPersonId
 ? reminders.filter((r) => {
 const todo = personTodos.find((t) => t.id === r.todo_id)
 return !!todo
 })
 : []

 const groupedByStatus = STATUS_ORDER.reduce<Record<string, Todo[]>>((acc, status) => {
 acc[status] = personTodos.filter((t) => t.status === status)
 return acc
 }, {})

 const totalHours = personTodos
 .filter((t) => t.status !== 'done')
 .reduce((sum, t) => sum + t.estimated_hours, 0)

 const todoQueryKeys: unknown[][] = selectedPersonId
 ? [['todos', 'person', selectedPersonId], ['todos']]
 : [['todos']]

 return (
 <div className="flex h-full">
 {/* Left panel — below md it becomes the list view of a list→detail flow */}
 <div
 style={isDesktop ? { width: panelCollapsed ? 40 : renderedPanelWidth } : undefined}
 className={`relative bg-surface md:border-r border-border flex-col flex-shrink-0 transition-[width] duration-200 ${
 selectedPersonId != null ? 'hidden md:flex' : 'flex w-full md:w-auto'
 }`}
 >
 {panelCollapsed && isDesktop ? (
 <div className="flex flex-col items-center flex-1 justify-end py-3">
 <button
 onClick={togglePanel}
 className="p-2 rounded-lg text-fg-subtle hover:bg-inset dark:hover:bg-elevated hover:text-fg-muted dark:hover:text-fg transition-colors"
 title="Expand people panel"
 >
 <ChevronsRight size={16} />
 </button>
 </div>
 ) : (
 <>
 <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
 <h3 className="font-semibold text-fg text-xs uppercase tracking-wide">People</h3>
 <div className="flex items-center gap-1">
 <button
 onClick={togglePanelExpanded}
 title={panelExpanded ? 'Compact view' : 'Expanded view'}
 className="p-1 rounded text-fg-subtle hover:text-fg-muted dark:hover:text-fg hover:bg-inset dark:hover:bg-elevated transition-colors"
 >
 {panelExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
 </button>
 <button
 onClick={() => setShowAddPerson(true)}
 className="text-accent hover:text-accent-fg text-xs font-semibold"
 >
 + Add
 </button>
 </div>
 </div>
 <div
 className="flex-1 overflow-y-auto py-1"
 onDragOver={(e) => {
 if (dragId !== null) {
 e.preventDefault()
 // Hovering empty space below the last row → drop at the end.
 const target = e.target as HTMLElement
 if (!target.closest('[data-person-row]')) {
 setDropIndex(persons.length)
 }
 }
 }}
 onDrop={(e) => {
 if (dragId !== null && dropIndex !== null) {
 e.preventDefault()
 commitReorder(dragId, dropIndex)
 }
 setDragId(null)
 setDropIndex(null)
 }}
 >
 {persons.length === 0 ? (
 <p className="px-4 py-3 text-xs text-fg-subtle">No people yet</p>
 ) : (
 persons.map((person, index) => {
 const count = todoCountByPerson[person.id] || 0
 const isDirectReport = !!person.is_direct_report
 const checkInState = isDirectReport ? getCheckInState(person, timezone).state : 'ok'
 const hasAlerts = reminders.some((r) => {
 const t = allTodos.find((t) => t.id === r.todo_id)
 return t?.assignee_id === person.id
 })
 const isSelected = selectedPersonId === person.id
 const isDragging = dragId === person.id
 const showIndicatorAbove = dropIndex === index && dragId !== null && dragId !== person.id
 return (
 <div
 key={person.id}
 data-person-row
 draggable
 onDragStart={(e) => {
 setDragId(person.id)
 e.dataTransfer.effectAllowed = 'move'
 }}
 onDragOver={(e) => {
 if (dragId === null) return
 e.preventDefault()
 e.stopPropagation()
 const rect = e.currentTarget.getBoundingClientRect()
 const before = e.clientY < rect.top + rect.height / 2
 setDropIndex(before ? index : index + 1)
 }}
 onDrop={(e) => {
 if (dragId === null || dropIndex === null) return
 e.preventDefault()
 e.stopPropagation()
 commitReorder(dragId, dropIndex)
 setDragId(null)
 setDropIndex(null)
 }}
 onDragEnd={() => {
 setDragId(null)
 setDropIndex(null)
 }}
 className={isDragging ? 'opacity-40' : ''}
 >
 {showIndicatorAbove && (
 <div className="h-0.5 bg-accent-hover rounded-full mx-3" />
 )}
 <button
 onClick={() => setSelectedPersonId(person.id)}
 title={isDirectReport ? `${person.name} — direct report` : undefined}
 className={`group w-full px-3 py-1 text-sm transition-colors border-l-2 ${
 isDirectReport ? 'border-accent' : 'border-transparent'
 } ${
 isSelected
 ? 'bg-accent-2 text-accent-fg dark:bg-accent-1 dark:text-accent-fg font-semibold'
 : isDirectReport
 ? 'text-fg bg-accent-1/40 dark:bg-accent-1/25 hover:bg-inset dark:hover:bg-elevated'
 : 'text-fg hover:bg-inset dark:hover:bg-elevated'
 }`}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0">
 <span className="text-fg-faint dark:text-fg-muted text-[10px] leading-none cursor-grab opacity-0 group-hover:opacity-100 transition-opacity select-none">⠿</span>
 <div className="w-5 h-5 rounded-full bg-accent-2 text-accent-fg flex items-center justify-center text-[10px] font-bold flex-shrink-0">
 {person.name.charAt(0).toUpperCase()}
 </div>
 <span className={`truncate ${isDirectReport && !isSelected ? 'font-semibold' : ''}`}>
 {person.name}
 </span>
 {!panelExpanded && person.project_names.length > 0 && (
 <span
 className={`text-[11px] truncate ${isSelected ? 'text-accent' : 'text-fg-subtle'}`}
 title={person.project_names.join(' · ')}
 >
 · {person.project_names[0]}
 {person.project_names.length > 1 && ` +${person.project_names.length - 1}`}
 </span>
 )}
 </div>
 <div className="flex items-center gap-1.5 flex-shrink-0">
 {checkInState !== 'ok' && (
 <span
 className={`w-1.5 h-1.5 rounded-full ${
 checkInState === 'due' ? 'bg-warning' : 'bg-danger'
 }`}
 title={checkInState === 'due' ? 'Check-in due today' : 'Check-in overdue'}
 ></span>
 )}
 {hasAlerts && (
 <span className="w-1.5 h-1.5 rounded-full bg-danger" title="Has schedule alerts"></span>
 )}
 <span className="text-[11px] text-fg-subtle font-normal tabular-nums">{count}</span>
 </div>
 </div>
 {panelExpanded && person.project_names.length > 0 && (
 <div className="pl-7 pt-0.5 flex flex-wrap gap-1">
 {person.project_names.map((pn, i) => (
 <span
 key={`${person.project_ids[i]}-${pn}`}
 className={`text-[10px] px-1.5 py-0.5 rounded ${
 isSelected
 ? 'bg-accent-2/60 dark:bg-accent/60 text-accent-fg dark:text-accent-fg'
 : 'bg-inset text-fg-muted'
 }`}
 >
 {pn}
 </span>
 ))}
 </div>
 )}
 </button>
 {dropIndex === index + 1 && dragId !== null && dragId !== person.id && index === persons.length - 1 && (
 <div className="h-0.5 bg-accent-hover rounded-full mx-3 mt-0.5" />
 )}
 </div>
 )
 })
 )}
 </div>
 <ArchivedPeopleSection onSelect={setSelectedPersonId} />
 <div className="hidden md:block px-1.5 py-1 border-t border-border">
 <button
 onClick={togglePanel}
 className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs text-fg-subtle hover:bg-inset dark:hover:bg-elevated hover:text-fg-muted dark:hover:text-fg transition-colors"
 title="Collapse people panel"
 >
 <ChevronsLeft size={14} />
 Collapse
 </button>
 </div>
 <div
 onMouseDown={startPanelResize}
 className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent-hover/50 active:bg-accent/50 transition-colors"
 />
 </>
 )}
 </div>

 {/* Right panel — hidden below md until a person is selected */}
 <div className={`flex-1 flex-col overflow-hidden ${selectedPersonId == null ? 'hidden md:flex' : 'flex'}`}>
 <div className="px-4 py-2 border-b border-border flex items-center justify-between md:justify-end gap-1 bg-surface">
 <button
 onClick={() => setSelectedPersonId(null)}
 className="md:hidden flex items-center gap-1 text-sm font-medium text-accent"
 >
 <ChevronLeft size={16} /> People
 </button>
 <div className="inline-flex rounded-lg border border-border overflow-hidden">
 <button
 onClick={() => setViewMode('list')}
 title="List view"
 className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
 viewMode === 'list'
 ? 'bg-accent text-white'
 : 'bg-surface text-fg-muted hover:text-fg dark:hover:text-fg'
 }`}
 >
 <List size={12} /> List
 </button>
 <button
 onClick={() => setViewMode('board')}
 title="Board view — drag and drop people into projects"
 className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
 viewMode === 'board'
 ? 'bg-accent text-white'
 : 'bg-surface text-fg-muted hover:text-fg dark:hover:text-fg'
 }`}
 >
 <LayoutGrid size={12} /> Board
 </button>
 </div>
 </div>
 {viewMode === 'board' ? (
 <PersonProjectBoard dragPersonId={dragId} />
 ) : (
 <div className="flex-1 overflow-y-auto p-5">
 {!selectedPersonId ? (
 <div className="flex items-center justify-center h-64 text-fg-subtle text-sm">
 Select a person to view their todos
 </div>
 ) : (
 <>
 {/* Person header */}
 {selectedPerson && (
 <div className="bg-surface rounded-xl border border-border px-4 py-3 mb-3">
 <div className="flex items-center justify-between gap-4">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-10 h-10 rounded-full bg-accent-2 text-accent-fg flex items-center justify-center text-base font-bold flex-shrink-0">
 {selectedPerson.name.charAt(0).toUpperCase()}
 </div>
 <div className="min-w-0">
 <h2 className="text-lg font-bold text-fg leading-tight truncate">{selectedPerson.name}</h2>
 {selectedPerson.email && (
 <p className="text-xs text-fg-muted truncate">{selectedPerson.email}</p>
 )}
 </div>
 </div>
 <div className="flex items-center gap-3 flex-shrink-0">
 {/* Inline stats */}
 <div className="hidden sm:flex items-center gap-3 text-xs">
 <div className="flex items-baseline gap-1">
 <span className="font-bold text-fg">{personTodos.length}</span>
 <span className="text-fg-muted">todo{personTodos.length === 1 ? '' : 's'}</span>
 </div>
 <span className="text-fg-faint dark:text-fg-muted">·</span>
 <div className="flex items-baseline gap-1">
 <span className="font-bold text-fg">{totalHours.toFixed(1)}h</span>
 <span className="text-fg-muted">remaining</span>
 </div>
 {personReminders.filter((r) => r.status === 'behind').length > 0 && (
 <>
 <span className="text-fg-faint dark:text-fg-muted">·</span>
 <span className="font-semibold text-danger">
 {personReminders.filter((r) => r.status === 'behind').length} behind
 </span>
 </>
 )}
 {personReminders.filter((r) => r.status === 'warning').length > 0 && (
 <>
 <span className="text-fg-faint dark:text-fg-muted">·</span>
 <span className="font-semibold text-warning">
 {personReminders.filter((r) => r.status === 'warning').length} at risk
 </span>
 </>
 )}
 </div>
 <div className="flex gap-1.5">
 <button
 onClick={() => setShowTodoModal(true)}
 className="bg-accent text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-accent-hover transition-colors"
 >
 + Add Todo
 </button>
 <button
 onClick={() => archivePersonMutation.mutate(selectedPersonId)}
 title="Archive person"
 className="flex items-center gap-1 bg-inset text-fg-muted border border-border px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-inset transition-colors"
 >
 <Archive size={12} />
 Archive
 </button>
 </div>
 </div>
 </div>
 <PersonCheckInRow person={selectedPerson} />
 </div>
 )}

 {/* Project affiliations */}
 {selectedPerson && (
 <PersonProjects
 person={selectedPerson}
 projects={projects}
 onSave={(project_ids) =>
 updatePersonProjects.mutate({ id: selectedPerson.id, project_ids })
 }
 />
 )}

 {/* App access — this person's member account, invite and grants */}
 {selectedPerson && <PersonAccessSection person={selectedPerson} projects={projects} />}

 {/* Notes */}
 {selectedPerson && <PersonNotes person={selectedPerson} />}

 {/* Schedule alerts for person */}
 {personReminders.length > 0 && (
 <div className="mb-3">
 <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1.5">
 Schedule Alerts
 </h3>
 <div className="space-y-1.5">
 {personReminders.map((r) => (
 <div
 key={r.todo_id}
 className={`rounded-lg px-3 py-2 border-l-4 text-sm ${
 r.status === 'behind'
 ? 'bg-danger-bg border-danger'
 : 'bg-warning-bg border-warning'
 }`}
 >
 <div className="flex items-center justify-between gap-2">
 <span className="font-medium text-fg truncate">{r.title}</span>
 <span
 className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
 r.status === 'behind'
 ? 'bg-danger-bg text-danger'
 : 'bg-warning-bg text-warning'
 }`}
 >
 {r.status === 'behind' ? 'BEHIND' : 'WARNING'}
 </span>
 </div>
 <div className="text-[11px] text-fg-muted mt-0.5 flex gap-3">
 <span>Deadline: {r.deadline}</span>
 <span>Est: {r.estimated_hours}h</span>
 <span>Available: {r.available_hours}h</span>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Todos grouped by status */}
 {todosLoading ? (
 <div className="text-fg-muted text-sm">Loading...</div>
 ) : (
 <>
 {STATUS_ORDER.map((status) => {
 const todos = groupedByStatus[status] || []
 if (todos.length === 0) return null
 return (
 <div key={status} className="mb-4">
 <h3 className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 ${statusColor[status]}`}>
 {statusLabel[status]} ({todos.length})
 </h3>
 <div className="space-y-2">
 {todos.map((t) => (
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
 </div>
 </div>
 )
 })}
 <div className="bg-surface rounded-xl shadow-sm border border-dashed border-border overflow-hidden">
 <div className="px-5 py-4">
 <input
 type="text"
 value={newTitle}
 onChange={(e) => setNewTitle(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && newTitle.trim() && !addTodoForPerson.isPending) {
 addTodoForPerson.mutate(newTitle.trim())
 }
 }}
 placeholder={addTodoForPerson.isPending ? 'Adding...' : '+ Add a todo...'}
 disabled={addTodoForPerson.isPending}
 className="w-full text-sm font-medium text-fg-muted placeholder:text-fg-faint dark:placeholder:text-fg-faint bg-transparent outline-none disabled:opacity-50"
 />
 </div>
 </div>
 </>
 )}
 </>
 )}
 </div>
 )}
 <BulkActionBar
 selectedIds={selectedIds}
 onClearSelection={() => setSelectedIds(new Set())}
 queryKeys={todoQueryKeys}
 />
 </div>

 {showAddPerson && <AddPersonModal onClose={() => setShowAddPerson(false)} />}

 {showTodoModal && (
 <TodoModal
 todo={editingTodo}
 onClose={() => {
 setShowTodoModal(false)
 setEditingTodo(null)
 }}
 invalidateKeys={todoQueryKeys}
 defaultAssigneeId={selectedPersonId ?? undefined}
 />
 )}
 </div>
 )
}
