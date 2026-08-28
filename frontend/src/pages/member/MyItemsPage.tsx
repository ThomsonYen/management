import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Plus } from 'lucide-react'
import { createTodo, fetchProjects, fetchTodos } from '../../api'
import type { Project, Todo } from '../../types'
import { useSession } from '../../hooks/useSession'
import { useTimezone, useTodoDefaults } from '../../SettingsContext'
import { daysSinceDate, getTodayString } from '../../dateUtils'
import MemberTodoCard from '../../components/member/MemberTodoCard'
import DatePicker from '../../components/DatePicker'
import { Badge, EmptyState, SectionHeader, SegmentedControl } from '../../components/ui'

const IMPORTANCE_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

function compareTodos(a: Todo, b: Todo): number {
  const ad = a.deadline ?? '9999-99-99'
  const bd = b.deadline ?? '9999-99-99'
  if (ad !== bd) return ad < bd ? -1 : 1
  const rank = (IMPORTANCE_RANK[a.importance] ?? 9) - (IMPORTANCE_RANK[b.importance] ?? 9)
  return rank || a.id - b.id
}

function groupByProject(todos: Todo[]): { name: string; items: Todo[] }[] {
  const map = new Map<string, Todo[]>()
  for (const t of todos) {
    const key = t.project_name ?? ''
    const list = map.get(key)
    if (list) list.push(t)
    else map.set(key, [t])
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, items: [...items].sort(compareTodos) }))
    .sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : a.name.localeCompare(b.name)))
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  const cls =
    tone === 'danger' && value > 0
      ? 'border-danger/40 bg-danger-bg text-danger'
      : tone === 'warning' && value > 0
        ? 'border-warning/40 bg-warning-bg text-warning'
        : 'border-border bg-surface text-fg'
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  )
}

export default function MyItemsPage() {
  const user = useSession()
  const queryClient = useQueryClient()
  const { timezone } = useTimezone()
  const { defaults } = useTodoDefaults()
  const canEdit = user.access_level === 'edit'
  const [view, setView] = useState<'mine' | 'all'>('mine')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [importance, setImportance] = useState(defaults.importance)
  const [hours, setHours] = useState(defaults.estimatedHours)

  const { data: todos = [], isLoading } = useQuery<Todo[]>({
    queryKey: ['todos', { exclude_done: true }],
    queryFn: () => fetchTodos({ exclude_done: true }),
  })
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: fetchProjects })

  const today = getTodayString(timezone)
  const mine = useMemo(() => todos.filter((t) => t.assignee_id === user.person_id), [todos, user.person_id])
  const others = useMemo(() => todos.filter((t) => t.assignee_id !== user.person_id), [todos, user.person_id])
  const overdue = mine.filter((t) => t.deadline && t.deadline < today).length
  const dueThisWeek = mine.filter((t) => t.deadline && t.deadline >= today && daysSinceDate(t.deadline, timezone) >= -7).length
  const visible = view === 'all' ? todos : mine
  const groups = useMemo(() => groupByProject(visible), [visible])

  const openNewForm = () => {
    setTitle('')
    setProjectId('')
    setDeadline(defaults.deadlineToToday ? today : '')
    setImportance(defaults.importance)
    setHours(defaults.estimatedHours)
    setShowNew(true)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createTodo({
        title: title.trim(),
        project_id: projectId ? Number(projectId) : undefined,
        deadline: deadline || undefined,
        importance,
        estimated_hours: parseFloat(hours) || 1,
        assignee_id: user.person_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setShowNew(false)
    },
  })

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fg">My items</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            {user.person_name ?? user.username}
            {!canEdit && ' · view only'}
          </p>
        </div>
        {canEdit && !showNew && (
          <button
            onClick={openNewForm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-fg-on-accent rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> New todo
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 text-sm text-fg-muted">
          <Badge tone="warning">View only</Badge>
          Your account can read these items but not change them.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile label="Open" value={mine.length} />
        <StatTile label="Overdue" value={overdue} tone="danger" />
        <StatTile label="Due this week" value={dueThisWeek} tone="warning" />
      </div>

      {showNew && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && !createMutation.isPending) createMutation.mutate()
          }}
          className="mb-5 bg-surface rounded-xl border border-accent-2 shadow-sm p-4 space-y-3"
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            className="w-full text-sm font-medium px-3 py-2 rounded-md border border-border bg-app text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="flex items-center gap-1">
              📅 <DatePicker value={deadline} onChange={setDeadline} variant="inline" placeholder="Deadline" />
            </span>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {IMPORTANCE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              ⏱
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-16 text-xs border border-border rounded-md px-2 py-1 bg-app text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              h
            </label>
          </div>
          {createMutation.isError && <p className="text-xs text-danger">Could not create the todo.</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!title.trim() || createMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-fg-on-accent rounded-lg disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding…' : 'Add todo'}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {others.length > 0 && (
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: `Mine (${mine.length})` },
            { value: 'all', label: `All visible (${todos.length})` },
          ]}
          className="mb-4"
        />
      )}

      {isLoading && <p className="text-sm text-fg-subtle">Loading…</p>}

      {!isLoading && visible.length === 0 && (
        <div className="bg-surface rounded-xl border border-border shadow-sm">
          <EmptyState
            icon={ListChecks}
            title="Nothing assigned to you"
            description="Todos assigned to you will show up here as soon as they exist."
          />
        </div>
      )}

      {groups.map((group) => (
        <section key={group.name || '__none'} className="mb-6">
          <SectionHeader
            title={group.name || 'No project'}
            count={group.items.length}
            action={
              <span className="text-xs text-fg-subtle tabular-nums">
                {group.items.reduce((sum, t) => sum + t.estimated_hours, 0)}h
              </span>
            }
          />
          <div className="space-y-2">
            {group.items.map((t) => (
              <MemberTodoCard
                key={t.id}
                todo={t}
                editable={canEdit && t.assignee_id === user.person_id}
                showAssignee={view === 'all'}
                expanded={expanded.has(t.id)}
                onToggle={() => toggle(t.id)}
                projects={projects}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
