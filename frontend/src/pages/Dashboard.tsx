import { useQuery } from '@tanstack/react-query'
import { fetchReminders, fetchRecentlyDone, fetchTodos } from '../api'
import type { ScheduleStatus, Todo } from '../types'
import { ListTodo, Loader2, CheckCircle2, ShieldAlert, type LucideIcon } from 'lucide-react'

/** Returns the longest-hours chain of pending blockers starting from todoId. */
function longestBlockerPath(
  todoId: number,
  todosById: Map<number, Todo>,
  visited = new Set<number>(),
): Todo[] {
  if (visited.has(todoId)) return []
  visited.add(todoId)
  const todo = todosById.get(todoId)
  if (!todo) return []
  const pending = todo.blocked_by_ids
    .map((id) => todosById.get(id))
    .filter((b): b is Todo => !!b && b.status !== 'done')
  if (pending.length === 0) return []
  let bestPath: Todo[] = []
  let bestHours = -1
  for (const blocker of pending) {
    const sub = longestBlockerPath(blocker.id, todosById, new Set(visited))
    const hours = [blocker, ...sub].reduce((s, t) => s + t.estimated_hours, 0)
    if (hours > bestHours) {
      bestHours = hours
      bestPath = [blocker, ...sub]
    }
  }
  return bestPath
}

const scheduleStatusBadge = (s: string) => {
  const map: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
  }
  return map[s] || 'bg-slate-100 text-slate-700'
}

function ScheduleCard({ item, todosById, onOpenTodo }: { item: ScheduleStatus; todosById: Map<number, Todo>; onOpenTodo: (id: number) => void }) {
  const isBehind = item.status === 'behind'
  const deficit = item.chain_hours - item.available_hours
  const blockerPath = longestBlockerPath(item.todo_id, todosById)
  return (
    <button
      onClick={() => onOpenTodo(item.todo_id)}
      className={`w-full text-left rounded-lg p-4 border-l-4 hover:brightness-95 transition-all ${
        isBehind
          ? 'bg-red-50 border-red-500'
          : 'bg-yellow-50 border-yellow-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Assigned to <span className="font-medium text-slate-700">{item.assignee_name}</span>
          </p>
        </div>
        <span
          className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${
            isBehind
              ? 'bg-red-100 text-red-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {isBehind ? 'BEHIND' : 'WARNING'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
        <span>Deadline: <strong>{item.deadline}</strong></span>
        <span>Own work: <strong>{item.estimated_hours}h</strong></span>
        {item.chain_hours > item.estimated_hours && (
          <span>Chain total: <strong>{item.chain_hours.toFixed(1)}h</strong></span>
        )}
        <span>Available: <strong>{item.available_hours}h</strong></span>
        {isBehind && (
          <span className="text-red-600 font-semibold">
            Deficit: {deficit.toFixed(1)}h
          </span>
        )}
      </div>
      {blockerPath.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-slate-500 mb-1">Blocked by:</p>
          <div className="flex flex-wrap items-center gap-1">
            {blockerPath.map((b, i) => (
              <span key={b.id} className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${scheduleStatusBadge(b.status)}`}>
                  {b.title}
                  <span className="ml-1 opacity-60">({b.estimated_hours}h)</span>
                </span>
                {i < blockerPath.length - 1 && (
                  <span className="text-slate-400 text-xs">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </button>
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

  const { data: recentlyDone = [] } = useQuery<Todo[]>({
    queryKey: ['recently-done'],
    queryFn: () => fetchRecentlyDone(),
  })

  const todosById = new Map(todos.map((t) => [t.id, t]))

  const statusCounts = todos.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  const behindCount = reminders.filter((r) => r.status === 'behind').length
  const warningCount = reminders.filter((r) => r.status === 'warning').length

  const recentTodos = [...todos]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)

  const importanceBadge = (imp: string) => {
    const map: Record<string, string> = {
      critical: 'bg-red-100 text-red-700',
      high: 'bg-orange-100 text-orange-700',
      medium: 'bg-blue-100 text-blue-700',
      low: 'bg-slate-100 text-slate-600',
    }
    return map[imp] || 'bg-slate-100 text-slate-600'
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      todo: 'bg-slate-100 text-slate-600',
      'in-progress': 'bg-blue-100 text-blue-700',
      done: 'bg-green-100 text-green-700',
    }
    return map[s] || 'bg-slate-100 text-slate-600'
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Todos" value={todos.length} color="bg-indigo-600" icon={ListTodo} />
        <StatCard label="In Progress" value={statusCounts['in-progress'] || 0} color="bg-blue-500" icon={Loader2} />
        <StatCard label="Completed" value={recentlyDone.length} color="bg-green-500" icon={CheckCircle2} />
        <StatCard label="Blocked" value={todos.filter((t) => t.is_blocked).length} color="bg-slate-500" icon={ShieldAlert} />
      </div>

      {/* Schedule alerts */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-lg font-semibold text-slate-800">Schedule Alerts</h3>
          {behindCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {behindCount} behind
            </span>
          )}
          {warningCount > 0 && (
            <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {warningCount} at risk
            </span>
          )}
        </div>
        {remindersLoading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : reminders.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
            All todos are on schedule!
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <ScheduleCard key={r.todo_id} item={r} todosById={todosById} onOpenTodo={onOpenTodo} />
            ))}
          </div>
        )}
      </div>

      {/* Recent todos */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">Recent Todos</h3>
        {todosLoading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : recentTodos.length === 0 ? (
          <div className="text-slate-500 text-sm">No todos yet.</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {recentTodos.map((t, i) => (
              <button
                key={t.id}
                onClick={() => onOpenTodo(t.id)}
                className={`w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-colors ${
                  i < recentTodos.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div>
                  <p className="font-medium text-slate-800 text-sm">{t.title}</p>
                  {t.assignee_name && (
                    <p className="text-xs text-slate-500">{t.assignee_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${importanceBadge(t.importance)}`}>
                    {t.importance}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge(t.status)}`}>
                    {t.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
