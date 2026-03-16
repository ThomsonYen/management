import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchRecentlyDone } from '../api'
import type { Todo } from '../types'

const importanceBadge = (imp: string) => {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
  }
  return map[imp] || 'bg-slate-100 text-slate-600'
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

function groupByDate(todos: Todo[]): { label: string; items: Todo[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, Todo[]> = { Today: [], Yesterday: [], 'This Week': [], Earlier: [], 'No date': [] }

  for (const todo of todos) {
    if (!todo.done_at) {
      groups['No date'].push(todo)
      continue
    }
    const d = new Date(todo.done_at)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (day >= today) groups['Today'].push(todo)
    else if (day >= yesterday) groups['Yesterday'].push(todo)
    else if (day >= weekAgo) groups['This Week'].push(todo)
    else groups['Earlier'].push(todo)
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export default function RecentlyDonePage() {
  const navigate = useNavigate()

  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ['recently-done'],
    queryFn: () => fetchRecentlyDone(),
  })

  const groups = groupByDate(todos)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Recently Done</h1>
        <p className="text-sm text-slate-500 mt-0.5">{todos.length} completed task{todos.length !== 1 ? 's' : ''}</p>
      </div>

      {isLoading && <p className="text-slate-400 text-sm">Loading...</p>}

      {!isLoading && todos.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <p className="text-slate-400 text-sm">No completed tasks yet.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map(({ label, items }) => (
          <div key={label}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">{label}</h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {items.map((todo, idx) => (
                <div
                  key={todo.id}
                  onClick={() => navigate(`/todos/${todo.id}`)}
                  className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors ${
                    idx < items.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <span className="text-green-500 flex-shrink-0">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate line-through decoration-slate-300">
                      {todo.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      {todo.assignee_name && <span>◉ {todo.assignee_name}</span>}
                      {todo.project_name && <span>◈ {todo.project_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${importanceBadge(todo.importance)}`}>
                      {todo.importance}
                    </span>
                    <span className="text-xs text-slate-400">
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
