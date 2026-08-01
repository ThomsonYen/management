import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
 fetchTodo,
 fetchTodos,
 fetchPersons,
 fetchProjects,
 updateTodo,
 updateSubTodo,
 createSubTodo,
 deleteSubTodo,
 createTodo,
 deleteTodo,
 restoreTodo,
} from '../api'
import { useToast } from '../ToastContext'
import type { SubTodo, Todo, Person, Project } from '../types'
import DatePicker from '../components/DatePicker'
import TodoModal from '../components/TodoModal'
import { BlockerTreeNode, BlockingTreeNode } from '../components/BlockerTree'
import { config } from '../config'
import { useTimezone, useHotkeys } from '../SettingsContext'
import { isOverdue as checkOverdue } from '../dateUtils'
import { useHotkey } from '../hooks/useHotkey'
import { todoToMarkdown } from '../utils/todoMarkdown'

import { importanceBadgeClass } from '../utils/badgeClasses'

const importanceBadge = importanceBadgeClass

const BADGE_BASE = 'text-xs font-medium uppercase tracking-wide px-2.5 py-0.5 rounded-full border'
const DONE_BADGE = 'bg-success-bg text-success border-success/30'
const ACTION_BASE = 'text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40'


function BlockerPicker({
 allTodos,
 excludeId,
 selectedIds,
 onSelect,
 onCreate,
}: {
 allTodos: Todo[]
 excludeId: number
 selectedIds: number[]
 onSelect: (todo: Todo) => void
 onCreate?: (title: string) => void
}) {
 const [search, setSearch] = useState('')
 const [open, setOpen] = useState(false)

 const trimmed = search.trim()
 const filtered = trimmed
 ? allTodos.filter(
 (t) =>
 t.id !== excludeId &&
 !selectedIds.includes(t.id) &&
 t.title.toLowerCase().includes(trimmed.toLowerCase())
 )
 : []

 const showCreate = onCreate && trimmed && !filtered.some((t) => t.title.toLowerCase() === trimmed.toLowerCase())

 return (
 <div className="relative mt-3">
 <input
 type="text"
 value={search}
 onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
 onFocus={() => setOpen(true)}
 onBlur={() => setTimeout(() => setOpen(false), 150)}
 placeholder="Search todos to add..."
 className="w-full text-xs border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-fg-faint dark:placeholder:text-fg-faint "
 />
 {open && (filtered.length > 0 || showCreate) && (
 <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
 {filtered.map((t) => (
 <li
 key={t.id}
 onMouseDown={() => { onSelect(t); setSearch(''); setOpen(false) }}
 className="px-3 py-2 text-sm cursor-pointer hover:bg-accent-1 dark:hover:bg-accent-1 flex items-center gap-2"
 >
 <span className="text-fg-subtle text-xs flex-shrink-0">#{t.id}</span>
 <span className="flex-1 text-fg truncate">{t.title}</span>
 <span className="text-xs text-fg-subtle capitalize flex-shrink-0">{t.status}</span>
 </li>
 ))}
 {showCreate && (
 <li
 onMouseDown={() => { onCreate(trimmed); setSearch(''); setOpen(false) }}
 className="px-3 py-2 text-sm cursor-pointer hover:bg-success-bg flex items-center gap-2 border-t border-border-subtle"
 >
 <span className="text-success text-xs flex-shrink-0">+</span>
 <span className="flex-1 text-success">Create &quot;{trimmed}&quot;</span>
 </li>
 )}
 </ul>
 )}
 </div>
 )
}

export default function TodoDetailPage() {
 const { timezone } = useTimezone()
 const { id } = useParams<{ id: string }>()
 const todoId = Number(id)
 const navigate = useNavigate()
 const onBack = () => navigate(-1)
 const onOpenTodo = (newId: number) => navigate(`/todos/${newId}`)
 const queryClient = useQueryClient()
 const [showModal, setShowModal] = useState(false)
 const [newSubtodoTitle, setNewSubtodoTitle] = useState('')
 const [dragIdx, setDragIdx] = useState<number | null>(null)
 const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
 const [editingField, setEditingField] = useState<string | null>(null)
 const [editValue, setEditValue] = useState('')
 const [editingSubId, setEditingSubId] = useState<number | null>(null)
 const [editingSubTitle, setEditingSubTitle] = useState('')
 const [isDying, setIsDying] = useState(false)
 const dyingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 const [isUnfocusing, setIsUnfocusing] = useState(false)
 const unfocusingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

 useEffect(() => {
 return () => {
 if (dyingTimeoutRef.current) {
 clearTimeout(dyingTimeoutRef.current)
 updateTodo(todoId, { status: 'done' })
 }
 if (unfocusingTimeoutRef.current) {
 clearTimeout(unfocusingTimeoutRef.current)
 updateTodo(todoId, { is_focused: false })
 }
 }
 }, [todoId])

 const { data: todo, isLoading } = useQuery<Todo>({
 queryKey: ['todo', todoId],
 queryFn: () => fetchTodo(todoId),
 })

 const { data: allTodos = [] } = useQuery<Todo[]>({
 queryKey: ['todos'],
 queryFn: () => fetchTodos(),
 })

 const { data: persons = [] } = useQuery<Person[]>({
 queryKey: ['persons'],
 queryFn: fetchPersons,
 })

 const { data: projects = [] } = useQuery<Project[]>({
 queryKey: ['projects'],
 queryFn: fetchProjects,
 })

 const invalidate = () => {
 queryClient.invalidateQueries({ queryKey: ['todo', todoId] })
 queryClient.invalidateQueries({ queryKey: ['todos'] })
 queryClient.invalidateQueries({ queryKey: ['reminders'] })
 queryClient.invalidateQueries({ queryKey: ['recently-done'] })
 }

 const updateMutation = useMutation({
 mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(todoId, data),
 onSuccess: invalidate,
 })

 const { showToast } = useToast()
 const deleteMutation = useMutation({
 mutationFn: () => deleteTodo(todoId),
 onSuccess: () => {
 const title = todo?.title ?? 'Todo'
 invalidate()
 queryClient.invalidateQueries({ queryKey: ['deleted-todos'] })
 showToast({
 message: `Deleted "${title}"`,
 action: {
 label: 'Undo',
 onClick: async () => {
 await restoreTodo(todoId)
 invalidate()
 queryClient.invalidateQueries({ queryKey: ['deleted-todos'] })
 },
 },
 })
 navigate(-1)
 },
 })

 const handleDoneCheck = (checked: boolean) => {
 if (checked && todo?.status !== 'done') {
 setIsDying(true)
 dyingTimeoutRef.current = setTimeout(() => {
 updateMutation.mutate({ status: 'done' })
 }, config.todo_done_fade_seconds * 1000)
 } else if (!checked) {
 if (dyingTimeoutRef.current) clearTimeout(dyingTimeoutRef.current)
 setIsDying(false)
 if (todo?.status === 'done') updateMutation.mutate({ status: 'todo' })
 }
 }

 // --- Hotkeys ---
 const { bindings } = useHotkeys()

 useHotkey(bindings.markDone, useCallback(() => {
 if (!todo || todo.status === 'done') return
 handleDoneCheck(true)
 }, [todo]))

 useHotkey(bindings.toggleFocus, useCallback(() => {
 if (!todo) return
 updateMutation.mutate({ is_focused: !todo.is_focused })
 }, [todo, updateMutation]))

 useHotkey(bindings.editTodo, useCallback(() => {
 if (!todo) return
 setShowModal(true)
 }, [todo]))

 useHotkey(bindings.escape, useCallback(() => {
 if (showModal) setShowModal(false)
 else onBack()
 }, [showModal, onBack]), { skipInputCheck: true })

 const saveField = (field: string, value: unknown) => {
 updateMutation.mutate({ [field]: value } as Parameters<typeof updateTodo>[1])
 setEditingField(null)
 }

 const startEdit = (e: React.MouseEvent, field: string, currentValue: string) => {
 e.stopPropagation()
 setEditingField(field)
 setEditValue(currentValue)
 }

 const autoOpenSelect = (el: HTMLSelectElement | null) => {
 if (el) {
 el.focus()
 try { el.showPicker() } catch { /* not supported in all browsers */ }
 }
 }

 const toggleSubTodo = useMutation({
 mutationFn: ({ id, done }: { id: number; done: boolean }) =>
 updateSubTodo(id, { done }),
 onSuccess: invalidate,
 })

 const addSubTodo = useMutation({
 mutationFn: (title: string) =>
 createSubTodo(todoId, { title, order: todo?.subtodos.length ?? 0 }),
 onSuccess: () => {
 setNewSubtodoTitle('')
 invalidate()
 },
 })

 const removeSubTodo = useMutation({
 mutationFn: (id: number) => deleteSubTodo(id),
 onSuccess: invalidate,
 })

 const reorderMutation = useMutation({
 mutationFn: async (subtodos: SubTodo[]) => {
 await Promise.all(subtodos.map((s, i) => updateSubTodo(s.id, { order: i })))
 },
 onSuccess: invalidate,
 })

 if (isLoading || !todo) {
 return (
 <div className="p-6 max-w-3xl mx-auto">
 <button
 onClick={onBack}
 className="mb-4 text-sm text-accent hover:text-accent-fg flex items-center gap-1"
 >
 ← Back
 </button>
 <div className="text-fg-muted">Loading...</div>
 </div>
 )
 }

 const sortedSubtodos = [...todo.subtodos].sort((a, b) => a.order - b.order)
 const doneSubs = sortedSubtodos.filter((s) => s.done).length
 const totalSubs = sortedSubtodos.length

 const blockers = allTodos.filter((t) => todo.blocked_by_ids.includes(t.id))
 const blocking = allTodos.filter((t) => t.blocked_by_ids.includes(todoId))

 const isOverdue = checkOverdue(todo.deadline, todo.status, timezone)

 // Drag handlers
 const handleDragStart = (idx: number) => setDragIdx(idx)

 const handleDragOver = (e: React.DragEvent, idx: number) => {
 e.preventDefault()
 setDragOverIdx(idx)
 }

 const handleDrop = () => {
 if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx) {
 setDragIdx(null)
 setDragOverIdx(null)
 return
 }
 const reordered = [...sortedSubtodos]
 const [moved] = reordered.splice(dragIdx, 1)
 // After removing dragIdx, items shift left — adjust insertion point accordingly
 const insertAt = dragOverIdx > dragIdx ? dragOverIdx - 1 : dragOverIdx
 reordered.splice(insertAt, 0, moved)
 reorderMutation.mutate(reordered)
 setDragIdx(null)
 setDragOverIdx(null)
 }

 const handleDragEnd = () => {
 setDragIdx(null)
 setDragOverIdx(null)
 }

 const handleAddSubtodo = () => {
 const title = newSubtodoTitle.trim()
 if (title) addSubTodo.mutate(title)
 }

 return (
 <div
 className="p-6 max-w-3xl mx-auto"
 style={{ opacity: isDying ? 0 : 1, transition: `opacity ${config.todo_done_fade_seconds}s ease` }}
 >
 {/* Back */}
 <button
 onClick={onBack}
 className="mb-5 text-sm text-accent hover:text-accent-fg flex items-center gap-1 font-medium"
 >
 ← Back
 </button>

 {/* Header card */}
 <div className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-4">
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex flex-wrap gap-2 mb-3 items-center">
 <button
 onClick={() => {
 if (todo.is_focused && !isUnfocusing) {
 setIsUnfocusing(true)
 unfocusingTimeoutRef.current = setTimeout(() => {
 updateMutation.mutate({ is_focused: false })
 setIsUnfocusing(false)
 }, config.unfocus_fade_seconds * 1000)
 } else if (isUnfocusing) {
 if (unfocusingTimeoutRef.current) clearTimeout(unfocusingTimeoutRef.current)
 setIsUnfocusing(false)
 } else {
 updateMutation.mutate({ is_focused: true })
 }
 }}
 title={isUnfocusing ? 'Click to cancel unfocus' : todo.is_focused ? 'Remove from Focus' : 'Add to Focus'}
 className={`text-xl leading-none transition-colors ${
 isUnfocusing
 ? 'text-warning dark:text-warning animate-pulse'
 : todo.is_focused
 ? 'text-warning hover:text-warning'
 : 'text-fg-faint dark:text-fg-muted hover:text-warning'
 }`}
 >
 {todo.is_focused || isUnfocusing ? '★' : '☆'}
 </button>
 {editingField === 'importance' ? (
 <select
 ref={autoOpenSelect}
 value={todo.importance}
 onChange={(e) => saveField('importance', e.target.value)}
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className={`${BADGE_BASE} cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${importanceBadge(todo.importance)}`}
 >
 {['low', 'medium', 'high', 'critical'].map((o) => (
 <option key={o} value={o}>{o}</option>
 ))}
 </select>
 ) : (
 <span
 onClick={(e) => startEdit(e, 'importance', todo.importance)}
 title="Click to change importance"
 className={`${BADGE_BASE} cursor-pointer hover:ring-2 hover:ring-accent/40 transition-all ${importanceBadge(todo.importance)}`}
 >
 {todo.importance}
 </span>
 )}
 {todo.status === 'done' && (
 <span className={`${BADGE_BASE} ${DONE_BADGE}`}>
 done
 </span>
 )}
 {todo.is_blocked && (
 <span className={`${BADGE_BASE} bg-danger-bg text-danger border-danger/30`}>
 blocked
 </span>
 )}
 {isOverdue && (
 <span className={`${BADGE_BASE} bg-danger text-white border-danger`}>
 overdue
 </span>
 )}
 </div>
 <h1 className="text-2xl font-bold text-fg leading-tight">{todo.title}</h1>
 </div>
 <div className="flex-shrink-0 flex items-center gap-2">
 {todo.status === 'done' ? (
 <button
 onClick={() => handleDoneCheck(false)}
 className={`${ACTION_BASE} bg-inset text-fg-muted border-border hover:bg-border-subtle`}
 >
 ↩ Reopen
 </button>
 ) : (
 <button
 onClick={() => handleDoneCheck(true)}
 disabled={isDying}
 className={`${ACTION_BASE} bg-success-bg text-success border-success/30 hover:bg-success hover:text-white`}
 >
 ✓ Mark done
 </button>
 )}
 <button
 onClick={async () => {
 const md = todoToMarkdown(todo, allTodos)
 try {
 await navigator.clipboard.writeText(md)
 showToast({ message: `Copied "${todo.title}" as markdown`, tone: 'success' })
 } catch (err) {
 showToast({ message: `Copy failed: ${(err as Error).message}`, tone: 'danger' })
 }
 }}
 title="Copy todo as markdown"
 className={`${ACTION_BASE} bg-inset text-fg-muted border-border hover:bg-inset dark:text-fg `}
 >
 Copy md
 </button>
 <button
 onClick={() => setShowModal(true)}
 className={`${ACTION_BASE} bg-accent text-white border-accent hover:bg-accent-hover`}
 >
 Edit
 </button>
 </div>
 </div>

 {/* Meta grid */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
 <div
 onClick={(e) => startEdit(e, 'assignee_id', todo.assignee_id?.toString() || '')}
 title="Click to change assignee"
 className="bg-inset rounded-lg p-3 cursor-pointer hover:bg-accent-1 dark:hover:bg-accent-1 hover:ring-1 hover:ring-accent/40 transition-all"
 >
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Assignee
 </p>
 {editingField === 'assignee_id' ? (
 <select
 ref={autoOpenSelect}
 value={todo.assignee_id?.toString() || ''}
 onChange={(e) => saveField('assignee_id', e.target.value ? parseInt(e.target.value) : null)}
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className="text-sm w-full bg-transparent border-b border-accent focus:outline-none"
 >
 <option value="">— None —</option>
 {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
 </select>
 ) : (
 <p className="text-sm font-medium text-fg">
 {todo.assignee_name || <span className="text-fg-subtle font-normal">Unassigned</span>}
 </p>
 )}
 </div>
 <div className="bg-inset rounded-lg p-3">
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Deadline
 </p>
 <DatePicker
 value={todo.deadline || ''}
 onChange={(v) => saveField('deadline', v || null)}
 placeholder="None"
 triggerClassName={`text-sm font-medium ${isOverdue ? '!text-danger' : '!text-fg dark:!text-fg-faint'}`}
 />
 </div>
 <div
 onClick={(e) => startEdit(e, 'project_id', todo.project_id?.toString() || '')}
 title="Click to change project"
 className="bg-inset rounded-lg p-3 cursor-pointer hover:bg-accent-1 dark:hover:bg-accent-1 hover:ring-1 hover:ring-accent/40 transition-all"
 >
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Project
 </p>
 {editingField === 'project_id' ? (
 <select
 ref={autoOpenSelect}
 value={todo.project_id?.toString() || ''}
 onChange={(e) => saveField('project_id', e.target.value ? parseInt(e.target.value) : null)}
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className="text-sm w-full bg-transparent border-b border-accent focus:outline-none"
 >
 <option value="">— None —</option>
 {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
 </select>
 ) : (
 <p className="text-sm font-medium text-fg">
 {todo.project_name || <span className="text-fg-subtle font-normal">None</span>}
 </p>
 )}
 </div>
 <div
 onClick={(e) => startEdit(e, 'estimated_hours', todo.estimated_hours.toString())}
 title="Click to change estimated hours"
 className="bg-inset rounded-lg p-3 cursor-pointer hover:bg-accent-1 dark:hover:bg-accent-1 hover:ring-1 hover:ring-accent/40 transition-all"
 >
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Est. Hours
 </p>
 {editingField === 'estimated_hours' ? (
 <input
 autoFocus
 type="number"
 min="0.25"
 step="0.25"
 value={editValue}
 onChange={(e) => setEditValue(e.target.value)}
 onBlur={() => saveField('estimated_hours', parseFloat(editValue) || 1)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') saveField('estimated_hours', parseFloat(editValue) || 1)
 if (e.key === 'Escape') setEditingField(null)
 }}
 onClick={(e) => e.stopPropagation()}
 className="text-sm w-full bg-transparent border-b border-accent focus:outline-none"
 />
 ) : (
 <p className="text-sm font-medium text-fg">{todo.estimated_hours}h</p>
 )}
 </div>
 </div>

 {/* Description */}
 <div className="mt-5 pt-5 border-t border-border-subtle">
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
 Description
 </p>
 {editingField === 'description' ? (
 <textarea
 autoFocus
 value={editValue}
 onChange={(e) => setEditValue(e.target.value)}
 onBlur={() => saveField('description', editValue || null)}
 onKeyDown={(e) => {
 if (e.key === 'Escape') setEditingField(null)
 }}
 onClick={(e) => e.stopPropagation()}
 rows={4}
 className="text-sm text-fg w-full bg-transparent border border-accent-2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent resize-none leading-relaxed"
 />
 ) : (
 <p
 onClick={(e) => startEdit(e, 'description', todo.description || '')}
 title="Click to edit description"
 className="text-sm text-fg whitespace-pre-wrap leading-relaxed cursor-pointer hover:text-accent transition-colors min-h-[1.5rem]"
 >
 {todo.description || <em className="text-fg-faint dark:text-fg-muted not-italic">+ Add a description...</em>}
 </p>
 )}
 </div>

 <div className="mt-4 flex items-center justify-between text-xs text-fg-subtle">
 <span>Created {new Date(todo.created_at).toLocaleDateString()}</span>
 <button
 onClick={() => deleteMutation.mutate()}
 disabled={deleteMutation.isPending}
 title="Soft-delete (recoverable from Recently Deleted)"
 className="text-fg-subtle hover:text-danger dark:hover:text-danger transition-colors disabled:opacity-50"
 >
 Delete
 </button>
 </div>
 </div>

 {/* Subtasks card */}
 <div className="bg-surface rounded-xl border border-border shadow-sm p-5 mb-4">
 <div className="flex items-center justify-between mb-3">
 <h2 className="text-sm font-semibold text-fg uppercase tracking-wide">
 Subtasks
 </h2>
 {totalSubs > 0 && (
 <span className="text-sm text-fg-muted">
 {doneSubs}/{totalSubs}
 </span>
 )}
 </div>

 {totalSubs > 0 && (
 <div className="mb-4 h-1.5 bg-inset rounded-full overflow-hidden">
 <div
 className="h-full bg-accent rounded-full transition-all"
 style={{ width: `${(doneSubs / totalSubs) * 100}%` }}
 />
 </div>
 )}

 {/* Draggable subtodo list */}
 {sortedSubtodos.length > 0 ? (
 <ul>
 {sortedSubtodos.map((s, idx) => (
 <li
 key={s.id}
 draggable
 onDragStart={() => handleDragStart(idx)}
 onDragOver={(e) => handleDragOver(e, idx)}
 onDrop={handleDrop}
 onDragEnd={handleDragEnd}
 className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors select-none border-t-2
 ${dragIdx === idx ? 'opacity-40' : 'hover:bg-inset'}
 ${dragOverIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-accent' : 'border-transparent'}
 `}
 >
 <span className="cursor-grab text-fg-faint dark:text-fg-muted hover:text-fg-subtle text-lg leading-none flex-shrink-0">
 ⠿
 </span>
 <input
 type="checkbox"
 checked={s.done}
 onChange={(e) => toggleSubTodo.mutate({ id: s.id, done: e.target.checked })}
 className="accent-accent w-4 h-4 cursor-pointer flex-shrink-0"
 />
 {editingSubId === s.id ? (
 <input
 autoFocus
 type="text"
 value={editingSubTitle}
 onChange={(e) => setEditingSubTitle(e.target.value)}
 onBlur={() => {
 if (editingSubTitle.trim()) updateSubTodo(s.id, { title: editingSubTitle.trim() }).then(invalidate)
 setEditingSubId(null)
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && editingSubTitle.trim()) {
 updateSubTodo(s.id, { title: editingSubTitle.trim() }).then(invalidate)
 setEditingSubId(null)
 }
 if (e.key === 'Escape') setEditingSubId(null)
 }}
 onClick={(e) => e.stopPropagation()}
 className="flex-1 text-sm text-fg bg-transparent border-b border-accent focus:outline-none"
 />
 ) : (
 <span
 onClick={() => { setEditingSubId(s.id); setEditingSubTitle(s.title) }}
 title="Click to edit"
 className={`flex-1 text-sm cursor-pointer hover:text-accent transition-colors ${
 s.done ? 'line-through text-fg-subtle' : 'text-fg'
 }`}
 >
 {s.title}
 </span>
 )}
 <button
 onClick={() => removeSubTodo.mutate(s.id)}
 className="flex-shrink-0 text-fg-faint dark:text-fg-muted hover:text-danger transition-colors text-lg leading-none"
 >
 ×
 </button>
 </li>
 ))}
 </ul>
 ) : (
 <p className="text-sm text-fg-subtle mb-4">No subtasks yet.</p>
 )}

 {/* Add new subtask — also acts as the drop zone for the last position */}
 <div
 onDragOver={(e) => { e.preventDefault(); setDragOverIdx(sortedSubtodos.length) }}
 onDrop={handleDrop}
 className={`flex gap-2 border-t-2 transition-colors pt-3 ${
 dragOverIdx === sortedSubtodos.length && dragIdx !== null ? 'border-accent' : 'border-transparent'
 }`}
 >
 <input
 type="text"
 value={newSubtodoTitle}
 onChange={(e) => setNewSubtodoTitle(e.target.value)}
 onKeyDown={(e) => e.key === 'Enter' && handleAddSubtodo()}
 placeholder="Add a subtask..."
 className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent "
 />
 <button
 onClick={handleAddSubtodo}
 disabled={!newSubtodoTitle.trim() || addSubTodo.isPending}
 className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 >
 Add
 </button>
 </div>
 </div>

 {/* Blocked by */}
 <div className="bg-surface rounded-xl border border-border shadow-sm p-5 mb-4">
 <h2 className="text-sm font-semibold text-fg uppercase tracking-wide mb-3">
 Blocked by
 </h2>
 {blockers.length > 0 && (
 <ul className="space-y-2 mb-1">
 {blockers.map((blocker) => (
 <BlockerTreeNode
 key={blocker.id}
 todo={blocker}
 allTodos={allTodos}
 onOpenTodo={onOpenTodo}
 onRemove={() => updateMutation.mutate({ blocked_by_ids: todo.blocked_by_ids.filter((id) => id !== blocker.id) })}
 visited={new Set([todoId])}
 />
 ))}
 {todo.blocked_by_ids
 .filter((id) => !blockers.find((b) => b.id === id))
 .map((id) => (
 <li key={id} className="flex items-center gap-2">
 <span className="flex-1 px-3 py-2 text-sm text-fg-subtle">Todo #{id} (not found)</span>
 <button
 onClick={() => updateMutation.mutate({ blocked_by_ids: todo.blocked_by_ids.filter((bid: number) => bid !== id) })}
 className="flex-shrink-0 text-fg-faint dark:text-fg-muted hover:text-danger transition-colors text-lg leading-none px-1"
 >×</button>
 </li>
 ))}
 </ul>
 )}
 <BlockerPicker
 allTodos={allTodos}
 excludeId={todoId}
 selectedIds={todo.blocked_by_ids}
 onSelect={(t) => updateMutation.mutate({ blocked_by_ids: [...todo.blocked_by_ids, t.id] })}
 onCreate={(title) => createTodo({ title }).then((newTodo) => updateMutation.mutate({ blocked_by_ids: [...todo.blocked_by_ids, newTodo.id] }))}
 />
 </div>

 {/* Blocking others */}
 <div className="bg-surface rounded-xl border border-border shadow-sm p-5 mb-4">
 <h2 className="text-sm font-semibold text-fg uppercase tracking-wide mb-3">
 Blocking
 </h2>
 {blocking.length > 0 && (
 <ul className="space-y-2 mb-1">
 {blocking.map((blocked) => (
 <BlockingTreeNode
 key={blocked.id}
 todo={blocked}
 allTodos={allTodos}
 onOpenTodo={onOpenTodo}
 onRemove={() => updateTodo(blocked.id, { blocked_by_ids: blocked.blocked_by_ids.filter((id) => id !== todoId) }).then(invalidate)}
 visited={new Set([todoId])}
 />
 ))}
 </ul>
 )}
 <BlockerPicker
 allTodos={allTodos}
 excludeId={todoId}
 selectedIds={blocking.map((t) => t.id)}
 onSelect={(t) => updateTodo(t.id, { blocked_by_ids: [...t.blocked_by_ids, todoId] }).then(invalidate)}
 onCreate={(title) => createTodo({ title, blocked_by_ids: [todoId] }).then(() => invalidate())}
 />
 </div>

 {showModal && (
 <TodoModal
 todo={todo}
 onClose={() => {
 setShowModal(false)
 invalidate()
 }}
 invalidateKeys={[['todo', todoId], ['todos']]}
 />
 )}
 </div>
 )
}
