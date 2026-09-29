import { AlarmClock, ArrowUpRight, Calendar, ChevronDown, ChevronUp, Folder, GripVertical, Star, Timer, User } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import DescriptionEditor from './DescriptionEditor'
import { createTodo, createSubTodo, deleteTodo, restoreTodo, updateSubTodo, updateTodo, fetchPersons, fetchProjects, fetchTodos } from '../api'
import { useToast } from '../ToastContext'
import { useUnfocusWithUndo } from '../hooks/useUnfocusWithUndo'
import DatePicker from './DatePicker'
import type { Todo, Person, Project } from '../types'
import { pickableProjects, projectOptionLabel } from '../utils/projects'
import { useTimezone } from '../SettingsContext'
import { isOverdue as checkOverdue, getTodayString } from '../dateUtils'
import { todoToMarkdown } from '../utils/todoMarkdown'
import { importanceBadgeClass } from '../utils/badgeClasses'
import {
 buildTodoPatch,
 patchSubtodoCaches,
 patchTodoCaches,
 restoreTodoCaches,
 snapshotTodoCaches,
 type TodoCachesSnapshot,
} from '../utils/optimisticTodo'

const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

const importanceBadge = importanceBadgeClass

interface TodoCardProps {
 todo: Todo
 onEdit: (todo: Todo) => void
 onOpenDetail?: () => void
 queryKeys?: unknown[][]
 extraActions?: React.ReactNode
 isSelected?: boolean
 onToggleSelect?: (id: number) => void
}

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
 onCreate: (title: string) => void
}) {
 const [search, setSearch] = useState('')
 const [open, setOpen] = useState(false)

 const filtered = search
 ? allTodos.filter(
 (t) =>
 t.id !== excludeId &&
 !selectedIds.includes(t.id) &&
 t.title.toLowerCase().includes(search.toLowerCase())
 )
 : []

 const showCreateOption = search.trim().length > 0

 return (
 <div className="relative mt-2">
 <input
 type="text"
 value={search}
 onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
 onFocus={() => setOpen(true)}
 onBlur={() => setTimeout(() => setOpen(false), 150)}
 placeholder="Search todos to add..."
 className="w-full text-xs border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-fg-faint dark:placeholder:text-fg-faint "
 />
 {open && (filtered.length > 0 || showCreateOption) && (
 <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
 {showCreateOption && (
 <li
 onMouseDown={() => { onCreate(search.trim()); setSearch(''); setOpen(false) }}
 className="px-3 py-2 text-sm cursor-pointer hover:bg-success-bg flex items-center gap-2 border-b border-border-subtle"
 >
 <span className="text-success text-xs font-semibold flex-shrink-0">+ Create</span>
 <span className="flex-1 text-fg truncate">&ldquo;{search.trim()}&rdquo;</span>
 </li>
 )}
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
 </ul>
 )}
 </div>
 )
}

const autoOpenSelect = (el: HTMLSelectElement | null) => {
 if (el) {
 el.focus()
 try { el.showPicker() } catch { /* not supported in all browsers */ }
 }
}

/** Size a textarea to its content (used for the in-place sub-task editor). */
function fitToContent(el: HTMLTextAreaElement | null) {
 if (!el) return
 el.style.height = 'auto'
 el.style.height = `${el.scrollHeight}px`
}

export default function TodoCard({ todo, onEdit, onOpenDetail, queryKeys, extraActions, isSelected, onToggleSelect, forceCollapseSignal = 0 }: TodoCardProps & { forceCollapseSignal?: number }) {
 const { timezone } = useTimezone()
 const [expanded, setExpanded] = useState(false)

 useEffect(() => {
 if (forceCollapseSignal > 0) setExpanded(true)
 }, [forceCollapseSignal])
 const [editingField, setEditingField] = useState<string | null>(null)
 const [editValue, setEditValue] = useState('')
 const [newSubTitle, setNewSubTitle] = useState('')
 const [subDragId, setSubDragId] = useState<number | null>(null)
 const [subDropIdx, setSubDropIdx] = useState<number | null>(null)
 const [editingSubId, setEditingSubId] = useState<number | null>(null)
 const [editingSubTitle, setEditingSubTitle] = useState('')
 const [duplicatedId, setDuplicatedId] = useState<number | null>(null)
 const duplicateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 const queryClient = useQueryClient()
 const navigate = useNavigate()
 const { showToast } = useToast()
 const unfocusWithUndo = useUnfocusWithUndo()

 useEffect(() => {
 return () => {
 if (duplicateTimerRef.current) clearTimeout(duplicateTimerRef.current)
 }
 }, [])

 const { data: persons = [] } = useQuery<Person[]>({ queryKey: ['persons'], queryFn: fetchPersons })
 const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: fetchProjects })
 const { data: allTodos = [] } = useQuery<Todo[]>({ queryKey: ['todos'], queryFn: () => fetchTodos() })

 const invalidate = () => {
 const keys = queryKeys || [['todos']]
 keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
 queryClient.invalidateQueries({ queryKey: ['todo', todo.id] })
 queryClient.invalidateQueries({ queryKey: ['reminders'] })
 queryClient.invalidateQueries({ queryKey: ['recently-done'] })
 }

 // Edits update the caches immediately and sync in the background; onError
 // restores the pre-mutation snapshot, onSettled resyncs with the server.
 const rollback = (_err: unknown, _vars: unknown, snapshot?: TodoCachesSnapshot) =>
 restoreTodoCaches(queryClient, todo.id, snapshot)

 // Done / unfocus apply immediately; the toast offers an Undo for a few seconds.
 const handleDoneCheck = (checked: boolean) => {
 if (checked && todo.status !== 'done') {
 const previousStatus = todo.status
 updateMutation.mutate({ status: 'done' })
 showToast({
 message: `Marked "${todo.title}" done`,
 tone: 'success',
 action: { label: 'Undo', onClick: () => updateMutation.mutate({ status: previousStatus }) },
 })
 } else if (!checked && todo.status === 'done') {
 updateMutation.mutate({ status: 'todo' })
 }
 }

 const handleFocusToggle = () => {
 if (todo.is_focused) {
 unfocusWithUndo([todo])
 } else {
 updateMutation.mutate({ is_focused: true })
 }
 }

 const deleteMutation = useMutation({
 mutationFn: () => deleteTodo(todo.id),
 onSuccess: () => {
 invalidate()
 queryClient.invalidateQueries({ queryKey: ['deleted-todos'] })
 showToast({
 message: `Deleted "${todo.title}"`,
 action: {
 label: 'Undo',
 onClick: async () => {
 await restoreTodo(todo.id)
 invalidate()
 queryClient.invalidateQueries({ queryKey: ['deleted-todos'] })
 },
 },
 })
 },
 })

 const updateMutation = useMutation({
 mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(todo.id, data),
 onMutate: async (data) => {
 const snapshot = await snapshotTodoCaches(queryClient, todo.id)
 patchTodoCaches(queryClient, todo.id, buildTodoPatch(data, persons, projects))
 return snapshot
 },
 onError: rollback,
 onSettled: invalidate,
 })

 const toggleSubTodo = useMutation({
 mutationFn: ({ id, done }: { id: number; done: boolean }) => updateSubTodo(id, { done }),
 onMutate: async ({ id, done }) => {
 const snapshot = await snapshotTodoCaches(queryClient, todo.id)
 patchSubtodoCaches(queryClient, todo.id, (subs) =>
 subs.map((s) => (s.id === id ? { ...s, done } : s))
 )
 return snapshot
 },
 onError: rollback,
 onSettled: invalidate,
 })

 const addSubTodo = useMutation({
 mutationFn: (title: string) => createSubTodo(todo.id, { title, order: todo.subtodos.length }),
 onMutate: async (title) => {
 setNewSubTitle('') // clear the input right away so typing the next sub-task isn't blocked
 const snapshot = await snapshotTodoCaches(queryClient, todo.id)
 patchSubtodoCaches(queryClient, todo.id, (subs) => [
 ...subs,
 { id: -Date.now(), title, done: false, order: subs.length }, // placeholder until refetch delivers the server row
 ])
 return snapshot
 },
 onError: rollback,
 onSettled: invalidate,
 })

 const saveSubTitle = (id: number, title: string) => {
 patchSubtodoCaches(queryClient, todo.id, (subs) =>
 subs.map((s) => (s.id === id ? { ...s, title } : s))
 )
 // sync in the background; invalidate either way so an error resyncs the cache
 updateSubTodo(id, { title }).catch(() => {}).then(invalidate)
 }

 const saveField = (field: string, value: unknown) => {
 updateMutation.mutate({ [field]: value } as Parameters<typeof updateTodo>[1])
 setEditingField(null)
 }

 const startEdit = (e: React.MouseEvent, field: string, currentValue: string) => {
 e.stopPropagation()
 setEditingField(field)
 setEditValue(currentValue)
 }

 const doneSubs = todo.subtodos.filter((s) => s.done).length
 const totalSubs = todo.subtodos.length

 const isOverdue = checkOverdue(todo.deadline, todo.status, timezone)

 const dragStartPos = useRef<{ x: number; y: number } | null>(null)

 const handleCardMouseDown = (e: React.MouseEvent) => {
 dragStartPos.current = { x: e.clientX, y: e.clientY }
 // A press inside the description editor selects text, not drags the card.
 e.currentTarget.setAttribute('draggable', (e.target as HTMLElement).closest('.cm-editor') ? 'false' : 'true')
 }

 const handleCardClick = (e: React.MouseEvent) => {
 if (!onToggleSelect) return
 // Ignore if this was a drag (moved more than 5px)
 if (dragStartPos.current) {
 const dx = Math.abs(e.clientX - dragStartPos.current.x)
 const dy = Math.abs(e.clientY - dragStartPos.current.y)
 if (dx > 5 || dy > 5) return
 }
 // Ignore clicks on interactive elements
 const target = e.target as HTMLElement
 if (target.closest('button, input, select, textarea, a, [role="button"]')) return
 onToggleSelect(todo.id)
 }

 return (
 <div
 draggable
 onDragStart={(e) => {
 e.dataTransfer.setData('application/x-todo-id', String(todo.id))
 e.dataTransfer.effectAllowed = 'link'
 }}
 onMouseDown={handleCardMouseDown}
 onClick={handleCardClick}
 className={`bg-surface rounded-xl shadow-sm border overflow-hidden transition-shadow duration-200 hover:shadow-md ${isSelected ? 'border-accent ring-2 ring-accent/40 dark:ring-accent' : 'border-border'}`}
 >
 {/* Header */}
 <div className="px-4 py-3 md:px-5 md:py-4">
 {/* Grid, not flex: on phones the title spans under the actions instead of
     being squeezed into a narrow column beside them. */}
 <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-x-3">
 {/* Focus toggle */}
 <button
 onClick={(e) => {
 e.stopPropagation()
 handleFocusToggle()
 }}
 title={todo.is_focused ? 'Remove from Focus' : 'Add to Focus'}
 className={`col-start-1 row-start-1 p-2 -m-2 mt-[-6px] text-lg leading-none flex-shrink-0 transition-colors ${
 todo.is_focused
 ? 'text-warning-vivid hover:text-warning-vivid'
 : 'text-fg-faint dark:text-fg-muted hover:text-warning-vivid'
 }`}
 >
 <Star size={17} fill={todo.is_focused ? 'currentColor' : 'none'} />
 </button>
 {/* Done checkbox */}
 <input
 type="checkbox"
 checked={todo.status === 'done'}
 onChange={(e) => handleDoneCheck(e.target.checked)}
 onClick={(e) => e.stopPropagation()}
 title="Mark as done"
 className="col-start-2 row-start-1 mt-1 w-4 h-4 rounded cursor-pointer accent-green-600 flex-shrink-0"
 />
 <div className="contents">
 {/* Badges row */}
 <div className="col-start-3 row-start-1 min-w-0 self-center flex flex-wrap items-center gap-2 mb-1">
 {/* Importance badge */}
 {editingField === 'importance' ? (
 <select
 ref={autoOpenSelect}
 value={todo.importance}
 onChange={(e) => saveField('importance', e.target.value)}
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className={`text-xs font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${importanceBadge(todo.importance)}`}
 >
 {IMPORTANCE_OPTIONS.map((o) => (
 <option key={o} value={o}>{o}</option>
 ))}
 </select>
 ) : (
 <span
 onClick={(e) => startEdit(e, 'importance', todo.importance)}
 title="Click to change importance"
 className={`text-xs font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide cursor-pointer hover:ring-2 hover:ring-accent/40 transition-all ${importanceBadge(todo.importance)}`}
 >
 {todo.importance}
 </span>
 )}

 {todo.status === 'done' && (
 <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize bg-success-bg text-success">
 done
 </span>
 )}

 {todo.is_blocked && (
 <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger-bg text-danger">
 blocked
 </span>
 )}
 {isOverdue && (
 <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
 <AlarmClock size={13} className="shrink-0" />
 Overdue
 </span>
 )}
 </div>

 {/* Title */}
 {editingField === 'title' ? (
 <input
 autoFocus
 type="text"
 value={editValue}
 onChange={(e) => setEditValue(e.target.value)}
 onBlur={() => {
 if (editValue.trim()) saveField('title', editValue.trim())
 else setEditingField(null)
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && editValue.trim()) saveField('title', editValue.trim())
 if (e.key === 'Escape') setEditingField(null)
 }}
 onClick={(e) => e.stopPropagation()}
 className="col-start-3 col-end-5 md:col-end-4 row-start-2 font-semibold text-fg text-base leading-tight w-full border-b-2 border-accent focus:outline-none bg-transparent pb-0.5"
 />
 ) : (
 <h3
 onClick={(e) => startEdit(e, 'title', todo.title)}
 title="Click to edit title"
 className="col-start-3 col-end-5 md:col-end-4 row-start-2 font-semibold text-fg text-base leading-tight cursor-pointer hover:text-accent transition-colors"
 >
 {todo.title}
 </h3>
 )}
 </div>

 {/* Actions */}
 <div className="col-start-4 row-start-1 md:row-end-3 justify-self-end flex items-center gap-1.5 md:gap-2 mb-1 md:mb-0">
 {extraActions}
 {onOpenDetail && (
 <button
 onClick={onOpenDetail}
 title="Open (quick view)"
 className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-accent bg-accent-1 hover:bg-accent-2 border border-accent-2 transition-colors"
 >
 <ArrowUpRight size={13} /><span className="hidden md:inline">Open</span>
 </button>
 )}
 <button
 onClick={() => setExpanded((e) => !e)}
 title={expanded ? 'Collapse' : 'Expand'}
 className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-fg-muted bg-inset hover:bg-inset border border-border transition-colors select-none"
 >
 {totalSubs > 0 && (
 <span className="text-fg-subtle">{doneSubs}/{totalSubs}</span>
 )}
 {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
 </button>
 </div>
 </div>

 {/* Info row (spans full card width so fields like "1h" aren't
   squeezed by the actions column on the right) */}
 <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-fg-muted pl-0 md:pl-[52px]">
 {/* Assignee */}
 {editingField === 'assignee_id' ? (
 <select
 ref={autoOpenSelect}
 value={todo.assignee_id?.toString() || ''}
 onChange={(e) =>
 saveField('assignee_id', e.target.value ? parseInt(e.target.value) : null)
 }
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className="text-xs border border-accent-2 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
 >
 <option value="">— None —</option>
 {persons.map((p) => (
 <option key={p.id} value={p.id}>{p.name}</option>
 ))}
 </select>
 ) : (
 <span
 onClick={(e) => startEdit(e, 'assignee_id', todo.assignee_id?.toString() || '')}
 title="Click to change assignee"
 className="flex items-center gap-1 cursor-pointer hover:text-accent transition-colors"
 >
 <User size={12} className="shrink-0" />
 {todo.assignee_name ?? <em className="text-fg-faint dark:text-fg-muted not-italic">+ person</em>}
 </span>
 )}

 {/* Deadline */}
 <span className={`flex items-center gap-1 ${isOverdue ? 'text-danger font-semibold' : ''}`}>
 <Calendar size={12} className="shrink-0" />
 <DatePicker
 value={todo.deadline || ''}
 onChange={(v) => saveField('deadline', v || null)}
 placeholder="+ date"
 triggerClassName={isOverdue ? 'text-danger font-semibold' : ''}
 />
 </span>

 {/* Project */}
 {editingField === 'project_id' ? (
 <select
 ref={autoOpenSelect}
 value={todo.project_id?.toString() || ''}
 onChange={(e) =>
 saveField('project_id', e.target.value ? parseInt(e.target.value) : null)
 }
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className="text-xs border border-accent-2 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
 >
 <option value="">— None —</option>
 {pickableProjects(projects, todo.project_id).map((p) => (
 <option key={p.id} value={p.id}>{projectOptionLabel(p)}</option>
 ))}
 </select>
 ) : (
 <span
 onClick={(e) => startEdit(e, 'project_id', todo.project_id?.toString() || '')}
 title="Click to change project"
 className="flex items-center gap-1 cursor-pointer hover:text-accent transition-colors"
 >
 <Folder size={12} className="shrink-0" />
 {todo.project_name ?? <em className="text-fg-faint dark:text-fg-muted not-italic">+ project</em>}
 </span>
 )}

 {/* Estimated hours */}
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
 className="text-xs border border-accent-2 rounded px-1 py-0.5 w-16 focus:outline-none focus:ring-1 focus:ring-accent"
 />
 ) : (
 <span
 onClick={(e) => startEdit(e, 'estimated_hours', todo.estimated_hours.toString())}
 title="Click to change estimated hours"
 className="flex items-center gap-1 cursor-pointer hover:text-accent transition-colors"
 >
 <Timer size={12} className="shrink-0" /> {todo.estimated_hours}h
 </span>
 )}
 </div>

 {/* Sub-todo progress bar */}
 {totalSubs > 0 && (
 <div
 className="mt-2 h-1.5 bg-inset rounded-full overflow-hidden cursor-pointer select-none"
 onClick={() => setExpanded((e) => !e)}
 >
 <div
 className="h-full bg-accent rounded-full transition-all"
 style={{ width: `${(doneSubs / totalSubs) * 100}%` }}
 />
 </div>
 )}
 </div>

 {/* Expanded content */}
 {expanded && (
 <div className="border-t border-border-subtle px-5 py-4 space-y-4">
 <div>
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Description
 </p>
 <DescriptionEditor
 value={todo.description}
 onSave={(d) => updateMutation.mutate({ description: d } as Parameters<typeof updateTodo>[1])}
 />
 </div>

 <div>
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
 Sub-tasks{totalSubs > 0 && ` (${doneSubs}/${totalSubs})`}
 </p>
 {totalSubs > 0 && (() => {
 const sorted = todo.subtodos.slice().sort((a, b) => a.order - b.order)
 const handleSubDragOver = (e: React.DragEvent, dropIndex: number) => {
 if (!e.dataTransfer.types.includes('application/x-subtodo-id')) return
 e.preventDefault()
 e.stopPropagation()
 setSubDropIdx(dropIndex)
 }
 const handleSubDrop = (e: React.DragEvent, dropIndex: number) => {
 e.preventDefault()
 e.stopPropagation()
 setSubDropIdx(null)
 setSubDragId(null)
 const draggedId = parseInt(e.dataTransfer.getData('application/x-subtodo-id'))
 const fromIdx = sorted.findIndex((x) => x.id === draggedId)
 if (fromIdx === -1 || dropIndex === fromIdx || dropIndex === fromIdx + 1) return
 const reordered = sorted.filter((x) => x.id !== draggedId)
 const insertAt = dropIndex > fromIdx ? dropIndex - 1 : dropIndex
 reordered.splice(insertAt, 0, sorted[fromIdx])
 const changed = reordered.filter((item, i) => item.order !== i)
 patchSubtodoCaches(queryClient, todo.id, (subs) =>
 subs.map((s) => {
 const i = reordered.findIndex((r) => r.id === s.id)
 return i === -1 || s.order === i ? s : { ...s, order: i }
 })
 )
 // sync in the background; invalidate after all writes land so the refetch can't race them
 Promise.all(changed.map((item) => updateSubTodo(item.id, { order: reordered.indexOf(item) })))
 .catch(() => {})
 .then(invalidate)
 }
 const dropLine = (
 <div className="h-0.5 bg-accent-hover rounded-full mx-1 transition-all" />
 )
 const dropZone = (idx: number) => (
 <div
 key={`drop-${idx}`}
 onDragOver={(e) => handleSubDragOver(e, idx)}
 onDrop={(e) => handleSubDrop(e, idx)}
 className={`transition-all ${subDragId !== null ? 'py-1.5' : 'py-0'}`}
 >
 {subDropIdx === idx && dropLine}
 </div>
 )
 return (
 <ul
 onDragLeave={(e) => {
 if (!e.currentTarget.contains(e.relatedTarget as Node)) setSubDropIdx(null)
 }}
 onDragEnd={() => { setSubDragId(null); setSubDropIdx(null) }}
 >
 {dropZone(0)}
 {sorted.map((s, idx) => (
 <li key={s.id}>
 <div
 className={`flex items-center gap-2 rounded px-1 -mx-1 py-1 ${subDragId === s.id ? 'opacity-40' : ''}`}
 >
 <span
 draggable
 onDragStart={(e) => {
 e.stopPropagation()
 e.dataTransfer.setData('application/x-subtodo-id', String(s.id))
 e.dataTransfer.effectAllowed = 'move'
 setSubDragId(s.id)
 }}
 className="flex text-fg-faint dark:text-fg-muted select-none cursor-grab active:cursor-grabbing"
 title="Drag to reorder"
 ><GripVertical size={12} /></span>
 <input
 type="checkbox"
 checked={s.done}
 onChange={(e) => toggleSubTodo.mutate({ id: s.id, done: e.target.checked })}
 className="accent-accent w-4 h-4 cursor-pointer"
 />
 {editingSubId === s.id ? (
 <textarea
 autoFocus
 // One line tall, growing only as the title wraps, so editing doesn't add a blank line.
 // Phones show 16px in both states: the iOS zoom guard (index.css) forces it on text fields.
 rows={1}
 ref={fitToContent}
 onInput={(e) => fitToContent(e.currentTarget)}
 value={editingSubTitle}
 onChange={(e) => setEditingSubTitle(e.target.value)}
 onBlur={() => {
 if (editingSubTitle.trim()) saveSubTitle(s.id, editingSubTitle.trim())
 setEditingSubId(null)
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey && editingSubTitle.trim()) {
 e.preventDefault()
 saveSubTitle(s.id, editingSubTitle.trim())
 setEditingSubId(null)
 }
 if (e.key === 'Escape') setEditingSubId(null)
 }}
 className="flex-1 min-w-0 block p-0 text-sm leading-5 max-md:text-base max-md:leading-6 text-fg bg-transparent resize-none overflow-hidden focus:outline-none shadow-[inset_0_-1.5px_0_rgb(var(--accent))]"
 />
 ) : (
 <span
 onClick={() => { setEditingSubId(s.id); setEditingSubTitle(s.title) }}
 className={`flex-1 min-w-0 text-sm leading-5 max-md:text-base max-md:leading-6 cursor-pointer hover:text-accent transition-colors break-words ${s.done ? 'line-through text-fg-subtle' : 'text-fg'}`}
 >
 {s.title}
 </span>
 )}
 </div>
 {dropZone(idx + 1)}
 </li>
 ))}
 </ul>
 )
 })()}
 <input
 type="text"
 value={newSubTitle}
 onChange={(e) => setNewSubTitle(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && newSubTitle.trim()) {
 addSubTodo.mutate(newSubTitle.trim())
 }
 }}
 placeholder="+ Add sub-task..."
 className="mt-2 w-full text-sm border border-dashed border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-fg-faint dark:placeholder:text-fg-faint dark:bg-transparent "
 />
 </div>

 <div>
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
 Blocked by
 </p>
 {todo.blocked_by_ids.length > 0 && (
 <ul className="space-y-1 mb-1">
 {todo.blocked_by_ids.map((bid) => {
 const blocker = allTodos.find((t) => t.id === bid)
 return (
 <li key={bid} className="flex items-center gap-2">
 <span className="flex-1 text-sm text-fg-muted truncate">
 {blocker ? blocker.title : `#${bid}`}
 </span>
 <button
 onClick={() => updateMutation.mutate({ blocked_by_ids: todo.blocked_by_ids.filter((id) => id !== bid) })}
 className="flex-shrink-0 text-fg-faint dark:text-fg-muted hover:text-danger transition-colors text-lg leading-none"
 >×</button>
 </li>
 )
 })}
 </ul>
 )}
 <BlockerPicker
 allTodos={allTodos}
 excludeId={todo.id}
 selectedIds={todo.blocked_by_ids}
 onSelect={(t) => updateMutation.mutate({ blocked_by_ids: [...todo.blocked_by_ids, t.id] })}
 onCreate={async (title) => {
 const newTodo = await createTodo({
 title,
 project_id: todo.project_id ?? undefined,
 status: 'todo',
 importance: 'medium',
 estimated_hours: 1,
 blocked_by_ids: [],
 })
 updateMutation.mutate({ blocked_by_ids: [...todo.blocked_by_ids, newTodo.id] })
 }}
 />
 </div>

 {duplicatedId !== null && (
 <div
 className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success-bg border border-success/30 animate-fade-in"
 style={{ animation: 'fadeInOut 3s ease forwards' }}
 >
 <span className="text-success text-xs font-medium">Duplicated!</span>
 <button
 onClick={(e) => {
 e.stopPropagation()
 navigate(`/todos/${duplicatedId}`)
 }}
 className="text-xs font-medium text-accent hover:text-accent-fg dark:hover:text-accent underline transition-colors"
 >
 Jump to #{duplicatedId} →
 </button>
 </div>
 )}

 <div className="flex gap-2 pt-1">
 <button
 onClick={() => onEdit(todo)}
 className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors"
 >
 Edit (sub-tasks & more)
 </button>
 <button
 onClick={async (e) => {
 e.stopPropagation()
 const today = getTodayString(timezone)
 const newTodo = await createTodo({
 title: todo.title,
 description: todo.description || undefined,
 importance: todo.importance,
 status: 'todo',
 estimated_hours: todo.estimated_hours,
 assignee_id: todo.assignee_id,
 project_id: todo.project_id ?? undefined,
 deadline: today,
 blocked_by_ids: todo.blocked_by_ids,
 })
 invalidate()
 setDuplicatedId(newTodo.id)
 if (duplicateTimerRef.current) clearTimeout(duplicateTimerRef.current)
 duplicateTimerRef.current = setTimeout(() => setDuplicatedId(null), 3000)
 }}
 className="px-3 py-1.5 bg-inset text-fg-muted text-xs font-medium rounded-lg hover:bg-inset transition-colors border border-border "
 >
 Duplicate
 </button>
 <button
 onClick={async (e) => {
 e.stopPropagation()
 const md = todoToMarkdown(todo, allTodos)
 try {
 await navigator.clipboard.writeText(md)
 showToast({ message: `Copied "${todo.title}" as markdown`, tone: 'success' })
 } catch (err) {
 showToast({ message: `Copy failed: ${(err as Error).message}`, tone: 'danger' })
 }
 }}
 title="Copy todo as markdown"
 className="px-3 py-1.5 bg-inset text-fg-muted text-xs font-medium rounded-lg hover:bg-inset transition-colors border border-border "
 >
 Copy md
 </button>
 <button
 onClick={() => deleteMutation.mutate()}
 disabled={deleteMutation.isPending}
 className="px-3 py-1.5 bg-danger-bg text-danger text-xs font-medium rounded-lg hover:bg-danger/20 transition-colors border border-danger/30 disabled:opacity-50"
 >
 Delete
 </button>
 </div>
 </div>
 )}
 </div>
 )
}
