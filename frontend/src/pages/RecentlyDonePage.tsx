import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchRecentlyDone } from '../api'
import type { Todo } from '../types'
import { useTimezone } from '../SettingsContext'
import { getTodayString, getDateString } from '../dateUtils'

const importanceBadge = (imp: string) => {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  }
  return map[imp] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
}

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
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Recently Done</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{todos.length} completed task{todos.length !== 1 ? 's' : ''}</p>
      </div>

      {isLoading && <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>}

      {!isLoading && todos.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">No completed tasks yet.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map(({ label, items }) => (
          <div key={label}>
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 px-1">{label}</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              {items.map((todo, idx) => (
                <div
                  key={todo.id}
                  onClick={() => navigate(`/todos/${todo.id}`)}
                  className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                    idx < items.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
                  }`}
                >
                  <span className="text-green-500 flex-shrink-0">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate line-through decoration-slate-300 dark:decoration-slate-600">
                      {todo.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {todo.assignee_name && <span>◉ {todo.assignee_name}</span>}
                      {todo.project_name && <span>◈ {todo.project_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${importanceBadge(todo.importance)}`}>
                      {todo.importance}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
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
