import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  LayoutDashboard,
  Crosshair,
  CheckSquare,
  FolderKanban,
  Users,
  FileText,
  Target,
  BarChart3,
  CheckCircle2,
  Trash2,
  Settings as SettingsIcon,
  Plus,
  Sun,
  Moon,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from 'lucide-react'
import {
  fetchTodos,
  fetchProjects,
  fetchPersons,
  fetchMeetingNotes,
  searchMeetingNotes,
} from '../api'
import { formatHotkey, useHotkeys, useTheme } from '../SettingsContext'

type ItemType = 'action' | 'todo' | 'project' | 'person' | 'meeting'

interface Item {
  id: string
  type: ItemType
  title: string
  subtitle?: string
  hint?: string
  icon: LucideIcon
  onSelect: () => void
}

interface Props {
  onClose: () => void
  onNewTodo: () => void
  onNewMeetingNote: () => void
}

const TYPE_LABEL: Record<ItemType, string> = {
  action: 'Action',
  todo: 'Todo',
  project: 'Project',
  person: 'Person',
  meeting: 'Meeting',
}

const RECENTS_KEY = 'cmdPalette.recent.v1'
const MAX_RECENTS = 8
const MAX_RESULTS = 30

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function scoreMatch(query: string, text: string): number {
  if (!text) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 500
  const wordStart = t.split(/[\s\-_/]/).some((w) => w.startsWith(q))
  if (wordStart) return 200
  const idx = t.indexOf(q)
  if (idx >= 0) return 100 - idx
  // Fuzzy subsequence
  let ti = 0
  for (const c of q) {
    const found = t.indexOf(c, ti)
    if (found < 0) return 0
    ti = found + 1
  }
  return 10
}

export default function CommandPalette({ onClose, onNewTodo, onNewMeetingNote }: Props) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { bindings } = useHotkeys()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecents())
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 180)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    setSelected(0)
  }, [query])

  const { data: todos = [] } = useQuery({ queryKey: ['todos'], queryFn: () => fetchTodos() })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })
  const { data: meetings = [] } = useQuery({ queryKey: ['meeting-notes'], queryFn: () => fetchMeetingNotes() })

  const { data: meetingContentHits = [] } = useQuery({
    queryKey: ['meeting-notes', 'search', debouncedQuery],
    queryFn: () => searchMeetingNotes(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 15_000,
  })

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: 'a:dashboard', type: 'action', title: 'Go to Dashboard', hint: formatHotkey(bindings.goToDashboard), icon: LayoutDashboard, onSelect: () => navigate('/') },
      { id: 'a:focus', type: 'action', title: 'Go to Focus', hint: formatHotkey(bindings.goToFocus), icon: Crosshair, onSelect: () => navigate('/focus') },
      { id: 'a:todos', type: 'action', title: 'Go to Todos', hint: formatHotkey(bindings.goToTodos), icon: CheckSquare, onSelect: () => navigate('/todos') },
      { id: 'a:projects', type: 'action', title: 'Go to Projects', hint: formatHotkey(bindings.goToProjects), icon: FolderKanban, onSelect: () => navigate('/projects') },
      { id: 'a:people', type: 'action', title: 'Go to People', hint: formatHotkey(bindings.goToPeople), icon: Users, onSelect: () => navigate('/people') },
      { id: 'a:meetings', type: 'action', title: 'Go to Meetings', hint: formatHotkey(bindings.goToMeetings), icon: FileText, onSelect: () => navigate('/meeting-notes') },
      { id: 'a:weekly', type: 'action', title: 'Go to Weekly Goals', icon: Target, onSelect: () => navigate('/weekly-goals') },
      { id: 'a:progress', type: 'action', title: 'Go to Progress', icon: BarChart3, onSelect: () => navigate('/progress') },
      { id: 'a:done', type: 'action', title: 'Go to Recently Done', hint: formatHotkey(bindings.goToDone), icon: CheckCircle2, onSelect: () => navigate('/done') },
      { id: 'a:deleted', type: 'action', title: 'Go to Recently Deleted', icon: Trash2, onSelect: () => navigate('/deleted') },
      { id: 'a:settings', type: 'action', title: 'Go to Settings', icon: SettingsIcon, onSelect: () => navigate('/settings') },
      { id: 'a:new-todo', type: 'action', title: 'New todo', hint: formatHotkey(bindings.newTodo), icon: Plus, onSelect: onNewTodo },
      { id: 'a:new-meeting', type: 'action', title: 'New meeting note', hint: formatHotkey(bindings.newMeetingNote), icon: FileText, onSelect: onNewMeetingNote },
      {
        id: 'a:theme',
        type: 'action',
        title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        hint: formatHotkey(bindings.toggleTheme),
        icon: theme === 'dark' ? Sun : Moon,
        onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ]

    const todoItems: Item[] = todos
      .filter((t) => !t.deleted_at)
      .map((t) => ({
        id: `t:${t.id}`,
        type: 'todo',
        title: t.title,
        subtitle: [t.project_name, t.assignee_name, t.status].filter(Boolean).join(' • ') || undefined,
        icon: CheckSquare,
        onSelect: () => navigate(`/todos/${t.id}`),
      }))

    const projectItems: Item[] = projects.map((p) => ({
      id: `p:${p.id}`,
      type: 'project',
      title: p.name,
      subtitle: p.description || undefined,
      icon: FolderKanban,
      onSelect: () => navigate(`/projects?project=${p.id}`),
    }))

    const personItems: Item[] = persons.map((p) => ({
      id: `u:${p.id}`,
      type: 'person',
      title: p.name,
      subtitle: p.email || undefined,
      icon: Users,
      onSelect: () => navigate(`/people?person=${p.id}`),
    }))

    const meetingItems: Item[] = meetings.map((m) => ({
      id: `m:${m.id}`,
      type: 'meeting',
      title: m.title,
      subtitle: [m.date, m.attendee_names.join(', '), m.project_names.join(', ')]
        .filter((s) => s && s.length > 0)
        .join(' • ') || undefined,
      icon: FileText,
      onSelect: () => navigate(`/meeting-notes/${m.id}`),
    }))

    const all: Item[] = [...actions, ...todoItems, ...projectItems, ...personItems, ...meetingItems]
    const byId = new Map(all.map((i) => [i.id, i]))

    const trimmed = query.trim()
    if (!trimmed) {
      const recent = recentIds.map((id) => byId.get(id)).filter((x): x is Item => !!x)
      const recentIdSet = new Set(recent.map((r) => r.id))
      const restActions = actions.filter((a) => !recentIdSet.has(a.id))
      return [...recent, ...restActions]
    }

    const contentHitIds = new Set(meetingContentHits.map((h) => `m:${h.id}`))

    const scored = all
      .map((item) => {
        const titleScore = scoreMatch(trimmed, item.title)
        const subtitleScore = item.subtitle ? scoreMatch(trimmed, item.subtitle) * 0.3 : 0
        let score = Math.max(titleScore, subtitleScore)
        if (contentHitIds.has(item.id)) score = Math.max(score, 150)
        if (score > 0 && recentIds.includes(item.id)) score += 5
        return { item, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((x) => x.item)

    return scored
  }, [todos, projects, persons, meetings, meetingContentHits, recentIds, query, navigate, onNewTodo, onNewMeetingNote, theme, setTheme, bindings])

  useEffect(() => {
    if (selected >= items.length) setSelected(0)
  }, [items.length, selected])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selected}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const handleSelect = (item: Item) => {
    setRecentIds((prev) => {
      const next = [item.id, ...prev.filter((id) => id !== item.id)].slice(0, MAX_RECENTS)
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
    item.onSelect()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (items.length === 0 ? 0 : Math.min(i + 1, items.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[selected]
      if (item) handleSelect(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const showingRecents = query.trim() === '' && recentIds.length > 0

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search todos, projects, people, meetings, or run a command…"
            className="flex-1 bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-sm"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-medium text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto max-h-[55vh] py-1">
          {showingRecents && (
            <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Recent
            </div>
          )}
          {items.length === 0 ? (
            <div className="px-4 py-10 text-sm text-center text-slate-500 dark:text-slate-400">
              No results.
            </div>
          ) : (
            items.map((item, idx) => {
              const Icon = item.icon
              const active = idx === selected
              const isFirstNonRecent =
                showingRecents && idx === recentIds.filter((id) => items.some((i) => i.id === id)).length
              return (
                <div key={item.id}>
                  {isFirstNonRecent && (
                    <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Actions
                    </div>
                  )}
                  <button
                    data-index={idx}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseMove={() => {
                      if (selected !== idx) setSelected(idx)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-900/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                    }`}
                  >
                    <Icon
                      size={16}
                      className={
                        active
                          ? 'text-indigo-600 dark:text-indigo-400 flex-shrink-0'
                          : 'text-slate-500 dark:text-slate-400 flex-shrink-0'
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm truncate ${
                          active
                            ? 'text-indigo-900 dark:text-indigo-100 font-medium'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {item.type !== 'action' && (
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 flex-shrink-0">
                        {TYPE_LABEL[item.type]}
                      </span>
                    )}
                    {item.hint && (
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex-shrink-0 ml-1">
                        {item.hint}
                      </span>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUp size={10} />
              <ArrowDown size={10} />
              <span className="ml-1">navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={10} />
              <span>select</span>
            </span>
          </div>
          <span>{items.length} {items.length === 1 ? 'result' : 'results'}</span>
        </div>
      </div>
    </div>
  )
}
