import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { createTodo, createSubTodo, deleteTodo, restoreTodo, updateSubTodo, updateTodo, fetchPersons, fetchProjects, fetchTodos } from '../api'
import { useToast } from '../ToastContext'
import DatePicker from './DatePicker'
import type { Todo, Person, Project } from '../types'
import { config } from '../config'
import { useTimezone } from '../SettingsContext'
import { isOverdue as checkOverdue, getTodayString } from '../dateUtils'
import { todoToMarkdown } from '../utils/todoMarkdown'
import { importanceBadgeClass } from '../utils/badgeClasses'

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
 const [isDying, setIsDying] = useState(false)
 const dyingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 const [isUnfocusing, setIsUnfocusing] = useState(false)
 const unfocusingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 const [duplicatedId, setDuplicatedId] = useState<number | null>(null)
 const duplicateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 const queryClient = useQueryClient()
 const navigate = useNavigate()
 const { showToast } = useToast()

 useEffect(() => {
 return () => {
 if (dyingTimeoutRef.current) {
 clearTimeout(dyingTimeoutRef.current)
 updateTodo(todo.id, { status: 'done' })
 }
 if (unfocusingTimeoutRef.current) {
 clearTimeout(unfocusingTimeoutRef.current)
 updateTodo(todo.id, { is_focused: false })
 }
 if (duplicateTimerRef.current) clearTimeout(duplicateTimerRef.current)
 }
 }, [todo.id])

 const { data: persons = [] } = useQuery<Person[]>({ queryKey: ['persons'], queryFn: fetchPersons })
 const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: fetchProjects })
 const { data: allTodos = [] } = useQuery<Todo[]>({ queryKey: ['todos'], queryFn: () => fetchTodos() })

 const invalidate = () => {
 const keys = queryKeys || [['todos']]
 keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
 queryClient.invalidateQueries({ queryKey: ['reminders'] })
 queryClient.invalidateQueries({ queryKey: ['recently-done'] })
 }

 const handleDoneCheck = (checked: boolean) => {
 if (checked && todo.status !== 'done') {
 setIsDying(true)
 dyingTimeoutRef.current = setTimeout(() => {
 updateMutation.mutate({ status: 'done' })
 }, config.todo_done_fade_seconds * 1000)
 } else if (!checked) {
 if (dyingTimeoutRef.current) clearTimeout(dyingTimeoutRef.current)
 setIsDying(false)
 if (todo.status === 'done') updateMutation.mutate({ status: 'todo' })
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
 onSuccess: invalidate,
 })

 const toggleSubTodo = useMutation({
 mutationFn: ({ id, done }: { id: number; done: boolean }) => updateSubTodo(id, { done }),
 onSuccess: invalidate,
 })

 const addSubTodo = useMutation({
 mutationFn: (title: string) => createSubTodo(todo.id, { title, order: todo.subtodos.length }),
 onSuccess: () => { invalidate(); setNewSubTitle('') },
 })

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
 className={`bg-surface rounded-xl shadow-sm border overflow-hidden cursor-grab active:cursor-grabbing ${isSelected ? 'border-accent ring-2 ring-accent/40 dark:ring-accent' : 'border-border'}`}
 style={{ opacity: isDying ? 0 : 1, transition: `opacity ${config.todo_done_fade_seconds}s ease` }}
 >
 {/* Header */}
 <div className="px-5 py-4">
 <div className="flex items-start gap-3">
 {/* Focus toggle */}
 <button
 onClick={(e) => {
 e.stopPropagation()
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
 className={`mt-0.5 text-lg leading-none flex-shrink-0 transition-colors ${
 isUnfocusing
 ? 'text-warning dark:text-warning animate-pulse'
 : todo.is_focused
 ? 'text-warning hover:text-warning'
 : 'text-fg-faint dark:text-fg-muted hover:text-warning'
 }`}
 >
 {todo.is_focused || isUnfocusing ? '★' : '☆'}
 </button>
 {/* Done checkbox */}
 <input
 type="checkbox"
 checked={isDying || todo.status === 'done'}
 onChange={(e) => handleDoneCheck(e.target.checked)}
 onClick={(e) => e.stopPropagation()}
 title="Mark as done"
 className="mt-1 w-4 h-4 rounded cursor-pointer accent-green-600 flex-shrink-0"
 />
 <div className="flex-1 min-w-0">
 {/* Badges row */}
 <div className="flex flex-wrap items-center gap-2 mb-1">
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
 <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger text-white">
 OVERDUE
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
 className="font-semibold text-fg text-base leading-tight w-full border-b-2 border-accent focus:outline-none bg-transparent pb-0.5"
 />
 ) : (
 <h3
 onClick={(e) => startEdit(e, 'title', todo.title)}
 title="Click to edit title"
 className="font-semibold text-fg text-base leading-tight cursor-pointer hover:text-accent transition-colors"
 >
 {todo.title}
 </h3>
 )}

 {/* Info row */}
 <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-fg-muted">
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
 <span>◉</span>
 {todo.assignee_name ?? <em className="text-fg-faint dark:text-fg-muted not-italic">+ person</em>}
 </span>
 )}

 {/* Deadline */}
 <span className={`flex items-center gap-1 ${isOverdue ? 'text-danger font-semibold' : ''}`}>
 <span>◷</span>
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
 saveField('project_id', e.target.value ? parseInt(e.target.value) : undefined)
 }
 onBlur={() => setEditingField(null)}
 onClick={(e) => e.stopPropagation()}
 className="text-xs border border-accent-2 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
 >
 <option value="">— None —</option>
 {projects.map((p) => (
 <option key={p.id} value={p.id}>{p.name}</option>
 ))}
 </select>
 ) : (
 <span
 onClick={(e) => startEdit(e, 'project_id', todo.project_id?.toString() || '')}
 title="Click to change project"
 className="flex items-center gap-1 cursor-pointer hover:text-accent transition-colors"
 >
 <span>◈</span>
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
 <span>⏱</span> {todo.estimated_hours}h
 </span>
 )}
 </div>
 </div>

 {/* Actions */}
 <div className="flex-shrink-0 flex items-center gap-2">
 {extraActions}
 {onOpenDetail && (
 <button
 onClick={onOpenDetail}
 title="Open todo page"
 className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-accent bg-accent-1 hover:bg-accent-2 border border-accent-2 transition-colors"
 >
 <span>↗</span> Open
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
 <span>{expanded ? '▲' : '▼'}</span>
 </button>
 </div>
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
 {editingField === 'description' ? (
 <div className="flex gap-3">
 <textarea
 autoFocus
 value={editValue}
 onChange={(e) => setEditValue(e.target.value)}
 onBlur={() => saveField('description', editValue || null)}
 onKeyDown={(e) => {
 if (e.key === 'Escape') setEditingField(null)
 }}
 onClick={(e) => e.stopPropagation()}
 rows={3}
 className="flex-1 min-w-0 text-sm text-fg bg-transparent border border-accent-2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent resize-y font-mono"
 />
 {editValue && (
 <div className="flex-1 min-w-0 overflow-y-auto max-h-[200px] px-2 py-1.5 border border-border rounded-lg">
 <div className="prose prose-sm dark:prose-invert max-w-none text-fg">
 <ReactMarkdown>{editValue}</ReactMarkdown>
 </div>
 </div>
 )}
 </div>
 ) : (
 <div
 onClick={(e) => startEdit(e, 'description', todo.description || '')}
 title="Click to edit description"
 className="cursor-pointer hover:text-accent transition-colors min-h-[1.25rem]"
 >
 {todo.description ? (
 <div className="prose prose-sm dark:prose-invert max-w-none text-fg">
 <ReactMarkdown>{todo.description}</ReactMarkdown>
 </div>
 ) : (
 <em className="text-sm text-fg-faint dark:text-fg-muted not-italic">+ Add a description...</em>
 )}
 </div>
 )}
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
 reordered.forEach((item, i) => {
 if (item.order !== i) updateSubTodo(item.id, { order: i })
 })
 invalidate()
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
 className="text-fg-faint dark:text-fg-muted text-xs select-none cursor-grab active:cursor-grabbing"
 title="Drag to reorder"
 >⠿</span>
 <input
 type="checkbox"
 checked={s.done}
 onChange={(e) => toggleSubTodo.mutate({ id: s.id, done: e.target.checked })}
 className="accent-accent w-4 h-4 cursor-pointer"
 />
 {editingSubId === s.id ? (
 <textarea
 autoFocus
 value={editingSubTitle}
 onChange={(e) => setEditingSubTitle(e.target.value)}
 onBlur={() => {
 if (editingSubTitle.trim()) updateSubTodo(s.id, { title: editingSubTitle.trim() }).then(invalidate)
 setEditingSubId(null)
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey && editingSubTitle.trim()) {
 e.preventDefault()
 updateSubTodo(s.id, { title: editingSubTitle.trim() }).then(invalidate)
 setEditingSubId(null)
 }
 if (e.key === 'Escape') setEditingSubId(null)
 }}
 rows={2}
 className="flex-1 min-w-0 text-sm border-b-2 border-accent focus:outline-none bg-transparent resize-y"
 />
 ) : (
 <span
 onClick={() => { setEditingSubId(s.id); setEditingSubTitle(s.title) }}
 className={`flex-1 min-w-0 text-sm cursor-pointer hover:text-accent transition-colors break-words ${s.done ? 'line-through text-fg-subtle' : 'text-fg'}`}
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
 if (e.key === 'Enter' && newSubTitle.trim() && !addSubTodo.isPending) {
 addSubTodo.mutate(newSubTitle.trim())
 }
 }}
 placeholder={addSubTodo.isPending ? 'Adding...' : '+ Add sub-task...'}
 disabled={addSubTodo.isPending}
 className="mt-2 w-full text-sm border border-dashed border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-fg-faint dark:placeholder:text-fg-faint disabled:opacity-50 dark:bg-transparent "
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
