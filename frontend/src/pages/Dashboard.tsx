import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchReminders, fetchRecentlyDone, fetchTodos, fetchPersons, updateTodo } from '../api'
import type { ScheduleStatus, Todo, Person } from '../types'
import { ListTodo, CheckCircle2, ShieldAlert, ExternalLink, type LucideIcon } from 'lucide-react'
import { BlockerTreeNode } from '../components/BlockerTree'
import DatePicker from '../components/DatePicker'
import { ImportanceBadge } from '../components/ui'
import {
 buildTodoPatch,
 patchTodoCaches,
 restoreTodoCaches,
 snapshotTodoCaches,
 type TodoCachesSnapshot,
} from '../utils/optimisticTodo'

const STATUS_OPTIONS = ['todo', 'done', 'blocked']
const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

const autoOpenSelect = (el: HTMLSelectElement | null) => {
 if (el) {
 el.focus()
 try { el.showPicker() } catch { /* not supported in all browsers */ }
 }
}

function ScheduleCard({ item, allTodos, persons, onOpenTodo }: { item: ScheduleStatus; allTodos: Todo[]; persons: Person[]; onOpenTodo: (id: number) => void }) {
 const queryClient = useQueryClient()
 const mainTodoObj = allTodos.find((t) => t.id === item.todo_id)
 const isFocused = mainTodoObj?.is_focused ?? false

 const [editingField, setEditingField] = useState<string | null>(null)
 const [editValue, setEditValue] = useState('')

 const invalidate = () => {
 queryClient.invalidateQueries({ queryKey: ['todos'] })
 queryClient.invalidateQueries({ queryKey: ['reminders'] })
 queryClient.invalidateQueries({ queryKey: ['recently-done'] })
 }

 const updateMutation = useMutation({
 mutationFn: (data: Parameters<typeof updateTodo>[1]) => updateTodo(item.todo_id, data),
 onMutate: async (data) => {
 const snapshot = await snapshotTodoCaches(queryClient, item.todo_id)
 await queryClient.cancelQueries({ queryKey: ['reminders'] })
 const reminders = queryClient.getQueryData<ScheduleStatus[]>(['reminders'])
 patchTodoCaches(queryClient, item.todo_id, buildTodoPatch(data, persons, []))
 // the card itself renders from the reminders query, so patch its fields there too
 queryClient.setQueryData<ScheduleStatus[]>(['reminders'], (old) =>
 old?.map((r) => {
 if (r.todo_id !== item.todo_id) return r
 const next = { ...r }
 if ('assignee_id' in data) next.assignee_name = persons.find((p) => p.id === data.assignee_id)?.name ?? ''
 if (typeof data.deadline === 'string') next.deadline = data.deadline
 if (typeof data.estimated_hours === 'number') next.estimated_hours = data.estimated_hours
 return next
 })
 )
 return { snapshot, reminders }
 },
 onError: (_err, _vars, context) => {
 restoreTodoCaches(queryClient, item.todo_id, context?.snapshot)
 if (context?.reminders) queryClient.setQueryData(['reminders'], context.reminders)
 },
 onSettled: invalidate,
 })

 const toggleFocus = useMutation({
 mutationFn: () => updateTodo(item.todo_id, { is_focused: !isFocused }),
 onMutate: async () => {
 const snapshot = await snapshotTodoCaches(queryClient, item.todo_id)
 patchTodoCaches(queryClient, item.todo_id, { is_focused: !isFocused })
 return snapshot
 },
 onError: (_err, _vars, snapshot?: TodoCachesSnapshot) =>
 restoreTodoCaches(queryClient, item.todo_id, snapshot),
 onSettled: invalidate,
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

 const isBehind = item.status === 'behind'
 const deficit = item.chain_hours - item.available_hours
 const directBlockers = mainTodoObj
 ? allTodos.filter((t) => mainTodoObj.blocked_by_ids.includes(t.id))
 : []

 return (
 <div
 draggable
 onDragStart={(e) => {
 e.dataTransfer.setData('application/x-todo-id', String(item.todo_id))
 e.dataTransfer.effectAllowed = 'link'
 }}
 className={`rounded-lg border-l-4 cursor-grab active:cursor-grabbing ${isBehind ? 'bg-danger-bg border-danger' : 'bg-warning-bg border-warning'}`}
 >
 <div className="p-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0 flex-1">
 <button
 onClick={() => onOpenTodo(item.todo_id)}
 className="font-semibold text-fg text-sm hover:underline text-left"
 >
 {item.title}
 </button>
 <div className="text-xs text-fg-muted mt-0.5 flex items-center gap-1">
 Assigned to{' '}
 {editingField === 'assignee_id' ? (
 <select
 ref={autoOpenSelect}
 value={editValue}
 onChange={(e) => {
 const v = e.target.value
 saveField('assignee_id', v ? Number(v) : null)
 }}
 onBlur={() => setEditingField(null)}
 className="text-xs border border-border rounded px-1 py-0.5 "
 >
 <option value="">Unassigned</option>
 {persons.map((p) => (
 <option key={p.id} value={p.id}>{p.name}</option>
 ))}
 </select>
 ) : (
 <button
 onClick={(e) => startEdit(e, 'assignee_id', String(mainTodoObj?.assignee_id ?? ''))}
 className="font-medium text-fg hover:text-accent dark:hover:text-accent hover:underline"
 >
 {item.assignee_name || 'Unassigned'}
 </button>
 )}
 </div>
 </div>
 <div className="flex items-center gap-1.5 flex-shrink-0">
 {/* Mark done */}
 <button
 onClick={(e) => {
 e.stopPropagation()
 updateMutation.mutate({ status: 'done' })
 }}
 disabled={updateMutation.isPending}
 title="Mark as done"
 className="text-fg-faint hover:text-success transition-colors"
 >
 <CheckCircle2 size={16} />
 </button>
 {/* Focus toggle */}
 <button
 onClick={(e) => {
 e.stopPropagation()
 toggleFocus.mutate()
 }}
 disabled={toggleFocus.isPending}
 title={isFocused ? 'Remove from Focus' : 'Add to Focus'}
 className={`text-sm px-1.5 py-0.5 rounded transition-colors ${
 isFocused
 ? 'text-warning hover:text-warning'
 : 'text-fg-faint hover:text-warning'
 }`}
 >
 {isFocused ? '★' : '☆'}
 </button>
 {/* Open detail */}
 <button
 onClick={(e) => {
 e.stopPropagation()
 onOpenTodo(item.todo_id)
 }}
 title="Open task"
 className="text-fg-faint hover:text-accent transition-colors"
 >
 <ExternalLink size={14} />
 </button>
 <span className={`text-xs font-bold px-2 py-1 rounded-full ${isBehind ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'}`}>
 {isBehind ? 'BEHIND' : 'WARNING'}
 </span>
 </div>
 </div>
 <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
 {/* Editable deadline */}
 <span className="flex items-center gap-1">
 Deadline:
 <DatePicker value={item.deadline} onChange={(v) => saveField('deadline', v)} />
 </span>
 {/* Editable estimated hours */}
 <span className="flex items-center gap-1">
 Own work:{' '}
 {editingField === 'estimated_hours' ? (
 <input
 type="number"
 autoFocus
 step="0.25"
 min="0"
 value={editValue}
 onChange={(e) => setEditValue(e.target.value)}
 onBlur={() => { if (editValue) saveField('estimated_hours', Number(editValue)); else setEditingField(null) }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && editValue) saveField('estimated_hours', Number(editValue))
 if (e.key === 'Escape') setEditingField(null)
 }}
 className="w-16 text-xs border border-border rounded px-1 py-0.5 "
 />
 ) : (
 <button
 onClick={(e) => startEdit(e, 'estimated_hours', String(item.estimated_hours))}
 className="font-bold hover:text-accent dark:hover:text-accent hover:underline"
 >
 {item.estimated_hours}h
 </button>
 )}
 </span>
 {item.chain_hours > item.estimated_hours && (
 <span>Chain total: <strong>{item.chain_hours.toFixed(1)}h</strong></span>
 )}
 <span>Available: <strong>{item.available_hours}h</strong></span>
 {isBehind && (
 <span className="text-danger font-semibold">Deficit: {deficit.toFixed(1)}h</span>
 )}
 {/* Editable status */}
 <span className="flex items-center gap-1">
 Status:{' '}
 {editingField === 'status' ? (
 <select
 ref={autoOpenSelect}
 value={editValue}
 onChange={(e) => saveField('status', e.target.value)}
 onBlur={() => setEditingField(null)}
 className="text-xs border border-border rounded px-1 py-0.5 capitalize"
 >
 {STATUS_OPTIONS.map((s) => (
 <option key={s} value={s}>{s}</option>
 ))}
 </select>
 ) : (
 <button
 onClick={(e) => startEdit(e, 'status', mainTodoObj?.status ?? 'todo')}
 className="font-bold hover:text-accent dark:hover:text-accent hover:underline capitalize"
 >
 {mainTodoObj?.status ?? 'todo'}
 </button>
 )}
 </span>
 {/* Editable importance */}
 <span className="flex items-center gap-1">
 Importance:{' '}
 {editingField === 'importance' ? (
 <select
 ref={autoOpenSelect}
 value={editValue}
 onChange={(e) => saveField('importance', e.target.value)}
 onBlur={() => setEditingField(null)}
 className="text-xs border border-border rounded px-1 py-0.5 capitalize"
 >
 {IMPORTANCE_OPTIONS.map((s) => (
 <option key={s} value={s}>{s}</option>
 ))}
 </select>
 ) : (
 <button
 onClick={(e) => startEdit(e, 'importance', mainTodoObj?.importance ?? 'medium')}
 className="font-bold hover:text-accent dark:hover:text-accent hover:underline capitalize"
 >
 {mainTodoObj?.importance ?? 'medium'}
 </button>
 )}
 </span>
 </div>
 </div>
 {directBlockers.length > 0 && (
 <div className="px-4 pb-3">
 <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Blocked by</p>
 <ul className="space-y-1">
 {directBlockers.map((blocker) => (
 <BlockerTreeNode
 key={blocker.id}
 todo={blocker}
 allTodos={allTodos}
 onOpenTodo={onOpenTodo}
 visited={new Set([item.todo_id])}
 />
 ))}
 </ul>
 </div>
 )}
 </div>
 )
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: LucideIcon }) {
 return (
 <div className={`rounded-xl p-5 text-white ${color}`}>
 <div className="flex items-start justify-between">
 <p className="text-3xl font-bold">{value}</p>
 <Icon size={20} className="opacity-70 mt-1" />
 </div>
 <p className="text-sm opacity-90 mt-1">{label}</p>
 </div>
 )
}

export default function Dashboard({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
 const { data: reminders = [], isLoading: remindersLoading } = useQuery<ScheduleStatus[]>({
 queryKey: ['reminders'],
 queryFn: fetchReminders,
 })

 const { data: todos = [], isLoading: todosLoading } = useQuery<Todo[]>({
 queryKey: ['todos', { exclude_done: true }],
 queryFn: () => fetchTodos({ exclude_done: true }),
 })

 const { data: allTodos = [] } = useQuery<Todo[]>({
 queryKey: ['todos'],
 queryFn: () => fetchTodos(),
 })

 const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
 const { data: recentlyDone = [] } = useQuery<Todo[]>({
 queryKey: ['recently-done', { since: 'past-7-days' }],
 queryFn: () => fetchRecentlyDone({ since: sevenDaysAgoIso }),
 })

 const { data: persons = [] } = useQuery<Person[]>({
 queryKey: ['persons'],
 queryFn: fetchPersons,
 })

 const behindCount = reminders.filter((r) => r.status === 'behind').length
 const warningCount = reminders.filter((r) => r.status === 'warning').length

 const recentTodos = [...todos]
 .sort((a, b) => b.created_at.localeCompare(a.created_at))
 .slice(0, 5)

 return (
 <div className="p-6 max-w-5xl mx-auto">
 <h2 className="text-2xl font-bold text-fg mb-6">Dashboard</h2>

 {/* Stats */}
 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
 <StatCard label="Total Todos" value={todos.length} color="bg-accent" icon={ListTodo} />
 <StatCard label="Completed (past 7 days)" value={recentlyDone.length} color="bg-info" icon={CheckCircle2} />
 <StatCard label="Blocked" value={todos.filter((t) => t.is_blocked).length} color="bg-fg-subtle" icon={ShieldAlert} />
 </div>

 {/* Schedule alerts */}
 <div className="mb-8">
 <div className="flex items-center gap-3 mb-3">
 <h3 className="text-lg font-semibold text-fg">Schedule Alerts</h3>
 {behindCount > 0 && (
 <span className="bg-danger-bg text-danger text-xs font-bold px-2 py-0.5 rounded-full">
 {behindCount} behind
 </span>
 )}
 {warningCount > 0 && (
 <span className="bg-warning-bg text-warning text-xs font-bold px-2 py-0.5 rounded-full">
 {warningCount} at risk
 </span>
 )}
 </div>
 {remindersLoading ? (
 <div className="text-fg-muted text-sm">Loading...</div>
 ) : reminders.length === 0 ? (
 <div className="bg-success-bg border border-success/30 rounded-lg p-4 text-success text-sm">
 All todos are on schedule!
 </div>
 ) : (
 <div className="space-y-3">
 {reminders.map((r) => (
 <ScheduleCard key={r.todo_id} item={r} allTodos={allTodos} persons={persons} onOpenTodo={onOpenTodo} />
 ))}
 </div>
 )}
 </div>

 {/* Recent todos */}
 <div>
 <h3 className="text-lg font-semibold text-fg mb-3">Recent Todos</h3>
 {todosLoading ? (
 <div className="text-fg-muted text-sm">Loading...</div>
 ) : recentTodos.length === 0 ? (
 <div className="text-fg-muted text-sm">No todos yet.</div>
 ) : (
 <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
 {recentTodos.map((t, i) => (
 <button
 key={t.id}
 onClick={() => onOpenTodo(t.id)}
 className={`w-full flex items-center justify-between px-5 py-3 text-left hover:bg-inset transition-colors ${
 i < recentTodos.length - 1 ? 'border-b border-border-subtle' : ''
 }`}
 >
 <div>
 <p className="font-medium text-fg text-sm">{t.title}</p>
 {t.assignee_name && (
 <p className="text-xs text-fg-muted">{t.assignee_name}</p>
 )}
 </div>
 <div className="flex items-center gap-2">
 <ImportanceBadge importance={t.importance} />
 {t.status === 'done' && (
 <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize bg-success-bg text-success">
 {t.status}
 </span>
 )}
 </div>
 </button>
 ))}
 </div>
 )}
 </div>
 </div>
 )
}
