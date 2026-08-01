import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchRecentlyDone } from '../api'
import type { Todo } from '../types'
import { useTimezone } from '../SettingsContext'
import { getTodayString, getDateString } from '../dateUtils'
import { ImportanceBadge } from '../components/ui'

function timeAgo(iso: string): string {
 const diffMs = Date.now() - new Date(iso).getTime()
 const mins = Math.floor(diffMs / 60000)
 if (mins < 1) return 'just now'
 if (mins < 60) return `${mins}m ago`
 const hrs = Math.floor(mins / 60)
 if (hrs < 24) return `${hrs}h ago`
 const days = Math.floor(hrs / 24)
 if (days < 7) return `${days}d ago`
 return new Date(iso).toLocaleDateString()
}

function groupByDate(todos: Todo[], timezone: string): { label: string; items: Todo[] }[] {
 const todayStr = getTodayString(timezone)
 const [y, m, d] = todayStr.split('-').map(Number)
 const todayMs = new Date(y, m - 1, d).getTime()
 const yesterdayMs = todayMs - 86400000
 const weekAgoMs = todayMs - 7 * 86400000

 const groups: Record<string, Todo[]> = { Today: [], Yesterday: [], 'This Week': [], Earlier: [], 'No date': [] }

 for (const todo of todos) {
 if (!todo.done_at) {
 groups['No date'].push(todo)
 continue
 }
 const dayStr = getDateString(todo.done_at, timezone)
 const [dy, dm, dd] = dayStr.split('-').map(Number)
 const dayMs = new Date(dy, dm - 1, dd).getTime()
 if (dayMs >= todayMs) groups['Today'].push(todo)
 else if (dayMs >= yesterdayMs) groups['Yesterday'].push(todo)
 else if (dayMs >= weekAgoMs) groups['This Week'].push(todo)
 else groups['Earlier'].push(todo)
 }

 return Object.entries(groups)
 .filter(([, items]) => items.length > 0)
 .map(([label, items]) => ({ label, items }))
}

export default function RecentlyDonePage() {
 const { timezone } = useTimezone()
 const navigate = useNavigate()

 const { data: todos = [], isLoading } = useQuery<Todo[]>({
 queryKey: ['recently-done'],
 queryFn: () => fetchRecentlyDone(),
 })

 const groups = groupByDate(todos, timezone)

 return (
 <div className="p-6 max-w-3xl mx-auto">
 <div className="mb-6">
 <h1 className="text-xl font-bold text-fg">Recently Done</h1>
 <p className="text-sm text-fg-muted mt-0.5">{todos.length} completed task{todos.length !== 1 ? 's' : ''}</p>
 </div>

 {isLoading && <p className="text-fg-subtle text-sm">Loading...</p>}

 {!isLoading && todos.length === 0 && (
 <div className="bg-surface rounded-xl border border-border shadow-sm p-10 text-center">
 <p className="text-fg-subtle text-sm">No completed tasks yet.</p>
 </div>
 )}

 <div className="space-y-6">
 {groups.map(({ label, items }) => (
 <div key={label}>
 <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2 px-1">{label}</h2>
 <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
 {items.map((todo, idx) => (
 <div
 key={todo.id}
 onClick={() => navigate(`/todos/${todo.id}`)}
 className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-inset transition-colors ${
 idx < items.length - 1 ? 'border-b border-border-subtle' : ''
 }`}
 >
 <span className="text-success flex-shrink-0">✓</span>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-fg dark:text-fg-faint truncate line-through decoration-slate-300 dark:decoration-slate-600">
 {todo.title}
 </p>
 <div className="flex items-center gap-2 mt-0.5 text-xs text-fg-subtle">
 {todo.assignee_name && <span>◉ {todo.assignee_name}</span>}
 {todo.project_name && <span>◈ {todo.project_name}</span>}
 </div>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <ImportanceBadge importance={todo.importance} />
 <span className="text-xs text-fg-subtle">
 {todo.done_at ? timeAgo(todo.done_at) : '—'}
 </span>
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 </div>
 )
}
