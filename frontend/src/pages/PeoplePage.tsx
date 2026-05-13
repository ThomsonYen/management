import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResizableSidebar } from '../hooks/useResizableSidebar'
import { useHotkeys } from '../SettingsContext'
import { useHotkey } from '../hooks/useHotkey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight, Maximize2, Minimize2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  fetchPersons,
  fetchProjects,
  fetchTodos,
  fetchReminders,
  createPerson,
  createTodo,
  deletePerson,
  restorePerson,
  purgePerson,
  fetchArchivedPersons,
  reorderPersons,
  updatePerson,
} from '../api'
import type { Person, Project, Todo, ScheduleStatus } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import MarkdownEditor from '../components/MarkdownEditor'
import SaveIndicator, { type SaveState } from '../components/SaveIndicator'
import { useDebouncedFn } from '../hooks/useDebouncedFn'
import { useToast } from '../ToastContext'

const STATUS_ORDER = ['todo', 'blocked']

const statusLabel: Record<string, string> = {
  todo: 'To Do',
  blocked: 'Blocked',
}

const statusColor: Record<string, string> = {
  todo: 'text-slate-600',
  blocked: 'text-red-600',
}

function AddPersonModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const mutation = useMutation({
    mutationFn: () => createPerson({ name, email: email || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Add Person</h3>
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Adding...' : 'Add Person'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function PersonNotes({ person }: { person: Person }) {
  const queryClient = useQueryClient()
  const initialNotes = person.notes || ''
  const [draft, setDraft] = useState(initialNotes)
  const [lastSaved, setLastSaved] = useState(initialNotes)
  const [showRaw, setShowRaw] = useState(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const serverNotes = person.notes || ''
    setLastSaved(serverNotes)
    if (serverNotes !== draftRef.current) {
      setDraft(serverNotes)
    }
  }, [person.id, person.notes])

  const saveMutation = useMutation({
    mutationFn: async (notes: string) => {
      const updated = await updatePerson(person.id, { notes })
      queryClient.setQueryData<Person[]>(['persons'], (old) =>
        old?.map((p) => (p.id === person.id ? { ...p, notes: updated.notes } : p)),
      )
      return updated
    },
    onSuccess: (_, variables) => setLastSaved(variables),
  })

  const debouncedSave = useDebouncedFn(
    (notes: string) => saveMutation.mutate(notes),
    { idleMs: 500, maxMs: 3000 },
  )

  const handleChange = useCallback((md: string) => {
    setDraft(md)
  }, [])

  const handleSave = useCallback((md: string) => {
    saveMutation.mutate(md)
  }, [saveMutation])

  const handleRawChange = useCallback((md: string) => {
    setDraft(md)
    debouncedSave.call(md)
  }, [debouncedSave])

  const dirty = draft !== lastSaved
  const saveState: SaveState =
    saveMutation.isPending ? 'saving' :
    dirty ? 'unsaved' :
    saveMutation.isSuccess ? 'saved' :
    'idle'

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Notes</h3>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          <button
            onClick={() => setShowRaw(v => !v)}
            className="text-[10px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {showRaw ? 'Hide raw' : 'Raw'}
          </button>
        </div>
      </div>
      {draft ? (
        <MarkdownEditor value={draft} onChange={handleChange} onSave={handleSave} />
      ) : (
        <p
          onClick={() => setDraft(' ')}
          className="text-sm text-slate-400 dark:text-slate-500 italic cursor-text"
        >
          Click to add notes...
        </p>
      )}
      {showRaw && (
        <textarea
          value={draft}
          onChange={(e) => handleRawChange(e.target.value)}
          rows={8}
          className="mt-2 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
      )}
    </div>
  )
}

function PersonProjects({
  person,
  projects,
  onSave,
}: {
  person: Person
  projects: Project[]
  onSave: (project_ids: number[]) => void
}) {
  const [picking, setPicking] = useState(false)
  const assignedIds = person.project_ids ?? []
  const available = projects.filter((p) => !assignedIds.includes(p.id) && !p.deleted_at)
  const projectById = new Map(projects.map((p) => [p.id, p]))

  const add = (pid: number) => {
    onSave([...assignedIds, pid])
    setPicking(false)
  }
  const remove = (pid: number) => {
    onSave(assignedIds.filter((id) => id !== pid))
  }
  const moveToFront = (pid: number) => {
    if (assignedIds[0] === pid) return
    onSave([pid, ...assignedIds.filter((id) => id !== pid)])
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-1">Projects</h3>
        {assignedIds.length === 0 && (
          <span className="text-xs italic text-slate-400 dark:text-slate-500">None — assign to surface in the sidebar</span>
        )}
        {assignedIds.map((pid, i) => {
          const proj = projectById.get(pid)
          if (!proj) return null
          const isPrimary = i === 0
          return (
            <span
              key={pid}
              className={`group inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
                isPrimary
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              title={isPrimary ? 'Primary affiliation' : 'Click ★ to make primary'}
            >
              {!isPrimary && (
                <button
                  onClick={() => moveToFront(pid)}
                  className="text-slate-400 hover:text-amber-500 leading-none"
                  title="Make primary"
                >
                  ★
                </button>
              )}
              <span className="truncate max-w-[10rem]">{proj.name}</span>
              <button
                onClick={() => remove(pid)}
                className="text-slate-400 hover:text-red-500 leading-none"
                title="Remove"
              >
                <X size={11} />
              </button>
            </span>
          )
        })}
        {picking ? (
          <select
            autoFocus
            onBlur={() => setPicking(false)}
            onChange={(e) => {
              const id = Number(e.target.value)
              if (id) add(id)
            }}
            className="text-xs rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            defaultValue=""
          >
            <option value="" disabled>Pick a project…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          available.length > 0 && (
            <button
              onClick={() => setPicking(true)}
              className="inline-flex items-center gap-0.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold rounded-full px-2 py-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            >
              <Plus size={11} /> Add
            </button>
          )
        )}
      </div>
    </div>
  )
}

function ArchivedPeopleSection({
  onSelect,
}: {
  onSelect: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)

  const { data: archived = [] } = useQuery<Person[]>({
    queryKey: ['persons', 'archived'],
    queryFn: fetchArchivedPersons,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['persons'] })
    queryClient.invalidateQueries({ queryKey: ['persons', 'archived'] })
  }

  const restoreMutation = useMutation({
    mutationFn: restorePerson,
    onSuccess: invalidate,
  })

  const purgeMutation = useMutation({
    mutationFn: purgePerson,
    onSuccess: invalidate,
  })

  if (archived.length === 0) return null

  return (
    <div className="border-t border-slate-200 dark:border-slate-800">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Archive size={12} />
          Archived
        </span>
        <span className="font-mono text-[11px]">{archived.length}</span>
      </button>
      {open && (
        <div className="pb-1">
          {archived.map((person) => (
            <div
              key={person.id}
              className="group flex items-center justify-between px-4 py-1.5 text-sm text-slate-500 dark:text-slate-400"
            >
              <button
                onClick={() => onSelect(person.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-slate-700 dark:hover:text-slate-200"
              >
                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate italic">{person.name}</span>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => restoreMutation.mutate(person.id)}
                  title="Restore"
                  className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <RotateCcw size={12} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Permanently delete ${person.name}? This cannot be undone.`)) {
                      purgeMutation.mutate(person.id, {
                        onSuccess: () => showToast({ message: `Deleted ${person.name} permanently` }),
                      })
                    }
                  }}
                  title="Delete permanently"
                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeoplePage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { width: panelWidth, collapsed: panelCollapsed, startResize: startPanelResize, toggleCollapsed: togglePanel } = useResizableSidebar('peoplePanelWidth', 256)
  const [panelExpanded, setPanelExpanded] = useState(() => localStorage.getItem('peoplePanelExpanded') === 'true')
  useEffect(() => { localStorage.setItem('peoplePanelExpanded', String(panelExpanded)) }, [panelExpanded])
  const togglePanelExpanded = useCallback(() => setPanelExpanded((v) => !v), [])
  const renderedPanelWidth = panelExpanded ? Math.max(panelWidth, 380) : panelWidth
  const { bindings } = useHotkeys()
  const stableTogglePanel = useCallback(() => togglePanel(), [togglePanel])
  useHotkey(bindings.toggleSecondarySidebar, stableTogglePanel)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedPersonId = searchParams.get('person') ? Number(searchParams.get('person')) : null
  const setSelectedPersonId = (id: number | null) =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); id ? p.set('person', String(id)) : p.delete('person'); return p })
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const invalidatePersons = () => {
    queryClient.invalidateQueries({ queryKey: ['persons'] })
    queryClient.invalidateQueries({ queryKey: ['persons', 'archived'] })
  }

  const [dragId, setDragId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const reorderMutation = useMutation({
    mutationFn: reorderPersons,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['persons'] }),
  })

  const commitReorder = (fromId: number, toIndex: number) => {
    const list = [...persons]
    const fromIndex = list.findIndex((p) => p.id === fromId)
    if (fromIndex === -1 || fromIndex === toIndex) return
    const [moved] = list.splice(fromIndex, 1)
    const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
    list.splice(insertAt, 0, moved)
    const payload = list.map((p, i) => ({ id: p.id, display_order: i + 1 }))
    queryClient.setQueryData<Person[]>(['persons'], list)
    reorderMutation.mutate(payload)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: persons = [] } = useQuery<Person[]>({
    queryKey: ['persons'],
    queryFn: fetchPersons,
  })

  const { data: allTodos = [] } = useQuery<Todo[]>({
    queryKey: ['todos', { exclude_done: true }],
    queryFn: () => fetchTodos({ exclude_done: true }),
  })

  const { data: personTodos = [], isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ['todos', 'person', selectedPersonId],
    queryFn: () => fetchTodos({ assignee_id: selectedPersonId!, exclude_done: true }),
    enabled: !!selectedPersonId,
  })

  const { data: reminders = [] } = useQuery<ScheduleStatus[]>({
    queryKey: ['reminders'],
    queryFn: fetchReminders,
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  const updatePersonProjects = useMutation({
    mutationFn: ({ id, project_ids }: { id: number; project_ids: number[] }) =>
      updatePerson(id, { project_ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['persons'] }),
  })

  const archivePersonMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: (_data, personId) => {
      const archivedName = persons.find((p) => p.id === personId)?.name ?? 'Person'
      invalidatePersons()
      setSelectedPersonId(null)
      showToast({
        message: `Archived ${archivedName}`,
        action: {
          label: 'Undo',
          onClick: async () => {
            await restorePerson(personId)
            invalidatePersons()
          },
        },
      })
    },
  })

  const addTodoForPerson = useMutation({
    mutationFn: (title: string) =>
      createTodo({ title, status: 'todo', importance: 'medium', estimated_hours: 1, assignee_id: selectedPersonId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      setNewTitle('')
    },
  })

  const todoCountByPerson = allTodos.reduce<Record<number, number>>((acc, t) => {
    if (t.assignee_id) {
      acc[t.assignee_id] = (acc[t.assignee_id] || 0) + 1
    }
    return acc
  }, {})

  const selectedPerson = persons.find((p) => p.id === selectedPersonId)

  const personReminders = selectedPersonId
    ? reminders.filter((r) => {
        const todo = personTodos.find((t) => t.id === r.todo_id)
        return !!todo
      })
    : []

  const groupedByStatus = STATUS_ORDER.reduce<Record<string, Todo[]>>((acc, status) => {
    acc[status] = personTodos.filter((t) => t.status === status)
    return acc
  }, {})

  const totalHours = personTodos
    .filter((t) => t.status !== 'done')
    .reduce((sum, t) => sum + t.estimated_hours, 0)

  const todoQueryKeys: unknown[][] = selectedPersonId
    ? [['todos', 'person', selectedPersonId], ['todos']]
    : [['todos']]

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div
        style={{ width: panelCollapsed ? 40 : renderedPanelWidth }}
        className="relative bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 transition-[width] duration-200"
      >
        {panelCollapsed ? (
          <div className="flex flex-col items-center flex-1 justify-end py-3">
            <button
              onClick={togglePanel}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              title="Expand people panel"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wide">People</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={togglePanelExpanded}
                  title={panelExpanded ? 'Compact view' : 'Expanded view'}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {panelExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </button>
                <button
                  onClick={() => setShowAddPerson(true)}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
                >
                  + Add
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto py-1"
              onDragOver={(e) => {
                if (dragId !== null) {
                  e.preventDefault()
                  // Hovering empty space below the last row → drop at the end.
                  const target = e.target as HTMLElement
                  if (!target.closest('[data-person-row]')) {
                    setDropIndex(persons.length)
                  }
                }
              }}
              onDrop={(e) => {
                if (dragId !== null && dropIndex !== null) {
                  e.preventDefault()
                  commitReorder(dragId, dropIndex)
                }
                setDragId(null)
                setDropIndex(null)
              }}
            >
              {persons.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">No people yet</p>
              ) : (
                persons.map((person, index) => {
                  const count = todoCountByPerson[person.id] || 0
                  const hasAlerts = reminders.some((r) => {
                    const t = allTodos.find((t) => t.id === r.todo_id)
                    return t?.assignee_id === person.id
                  })
                  const isSelected = selectedPersonId === person.id
                  const isDragging = dragId === person.id
                  const showIndicatorAbove = dropIndex === index && dragId !== null && dragId !== person.id
                  return (
                    <div
                      key={person.id}
                      data-person-row
                      draggable
                      onDragStart={(e) => {
                        setDragId(person.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => {
                        if (dragId === null) return
                        e.preventDefault()
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const before = e.clientY < rect.top + rect.height / 2
                        setDropIndex(before ? index : index + 1)
                      }}
                      onDrop={(e) => {
                        if (dragId === null || dropIndex === null) return
                        e.preventDefault()
                        e.stopPropagation()
                        commitReorder(dragId, dropIndex)
                        setDragId(null)
                        setDropIndex(null)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setDropIndex(null)
                      }}
                      className={isDragging ? 'opacity-40' : ''}
                    >
                      {showIndicatorAbove && (
                        <div className="h-0.5 bg-indigo-400 rounded-full mx-3" />
                      )}
                      <button
                        onClick={() => setSelectedPersonId(person.id)}
                        className={`group w-full px-3 py-1 text-sm transition-colors ${
                          isSelected
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-slate-300 dark:text-slate-600 text-[10px] leading-none cursor-grab opacity-0 group-hover:opacity-100 transition-opacity select-none">⠿</span>
                            <div className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                              {person.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate">{person.name}</span>
                            {!panelExpanded && person.project_names.length > 0 && (
                              <span
                                className={`text-[11px] truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
                                title={person.project_names.join(' · ')}
                              >
                                · {person.project_names[0]}
                                {person.project_names.length > 1 && ` +${person.project_names.length - 1}`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {hasAlerts && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            )}
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal tabular-nums">{count}</span>
                          </div>
                        </div>
                        {panelExpanded && person.project_names.length > 0 && (
                          <div className="pl-7 pt-0.5 flex flex-wrap gap-1">
                            {person.project_names.map((pn, i) => (
                              <span
                                key={`${person.project_ids[i]}-${pn}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  isSelected
                                    ? 'bg-indigo-200/60 dark:bg-indigo-800/60 text-indigo-800 dark:text-indigo-200'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {pn}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                      {dropIndex === index + 1 && dragId !== null && dragId !== person.id && index === persons.length - 1 && (
                        <div className="h-0.5 bg-indigo-400 rounded-full mx-3 mt-0.5" />
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <ArchivedPeopleSection onSelect={setSelectedPersonId} />
            <div className="px-1.5 py-1 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={togglePanel}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Collapse people panel"
              >
                <ChevronsLeft size={14} />
                Collapse
              </button>
            </div>
            <div
              onMouseDown={startPanelResize}
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500/50 transition-colors"
            />
          </>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {!selectedPersonId ? (
          <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500 text-sm">
            Select a person to view their todos
          </div>
        ) : (
          <>
            {/* Person header */}
            {selectedPerson && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 mb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-base font-bold flex-shrink-0">
                      {selectedPerson.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">{selectedPerson.name}</h2>
                      {selectedPerson.email && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{selectedPerson.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Inline stats */}
                    <div className="hidden sm:flex items-center gap-3 text-xs">
                      <div className="flex items-baseline gap-1">
                        <span className="font-bold text-slate-800 dark:text-slate-100">{personTodos.length}</span>
                        <span className="text-slate-500 dark:text-slate-400">todo{personTodos.length === 1 ? '' : 's'}</span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <div className="flex items-baseline gap-1">
                        <span className="font-bold text-slate-800 dark:text-slate-100">{totalHours.toFixed(1)}h</span>
                        <span className="text-slate-500 dark:text-slate-400">remaining</span>
                      </div>
                      {personReminders.filter((r) => r.status === 'behind').length > 0 && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-semibold text-red-600">
                            {personReminders.filter((r) => r.status === 'behind').length} behind
                          </span>
                        </>
                      )}
                      {personReminders.filter((r) => r.status === 'warning').length > 0 && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-semibold text-yellow-600">
                            {personReminders.filter((r) => r.status === 'warning').length} at risk
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setShowTodoModal(true)}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        + Add Todo
                      </button>
                      <button
                        onClick={() => archivePersonMutation.mutate(selectedPersonId)}
                        title="Archive person"
                        className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                      >
                        <Archive size={12} />
                        Archive
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Project affiliations */}
            {selectedPerson && (
              <PersonProjects
                person={selectedPerson}
                projects={projects}
                onSave={(project_ids) =>
                  updatePersonProjects.mutate({ id: selectedPerson.id, project_ids })
                }
              />
            )}

            {/* Notes */}
            {selectedPerson && <PersonNotes person={selectedPerson} />}

            {/* Schedule alerts for person */}
            {personReminders.length > 0 && (
              <div className="mb-3">
                <h3 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Schedule Alerts
                </h3>
                <div className="space-y-1.5">
                  {personReminders.map((r) => (
                    <div
                      key={r.todo_id}
                      className={`rounded-lg px-3 py-2 border-l-4 text-sm ${
                        r.status === 'behind'
                          ? 'bg-red-50 dark:bg-red-900/30 border-red-500'
                          : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{r.title}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            r.status === 'behind'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {r.status === 'behind' ? 'BEHIND' : 'WARNING'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex gap-3">
                        <span>Deadline: {r.deadline}</span>
                        <span>Est: {r.estimated_hours}h</span>
                        <span>Available: {r.available_hours}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Todos grouped by status */}
            {todosLoading ? (
              <div className="text-slate-500 dark:text-slate-400 text-sm">Loading...</div>
            ) : (
              <>
                {STATUS_ORDER.map((status) => {
                  const todos = groupedByStatus[status] || []
                  if (todos.length === 0) return null
                  return (
                    <div key={status} className="mb-4">
                      <h3 className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 ${statusColor[status]}`}>
                        {statusLabel[status]} ({todos.length})
                      </h3>
                      <div className="space-y-2">
                        {todos.map((t) => (
                          <TodoCard
                            key={t.id}
                            todo={t}
                            onEdit={(todo) => {
                              setEditingTodo(todo)
                              setShowTodoModal(true)
                            }}
                            onOpenDetail={() => onOpenTodo(t.id)}
                            queryKeys={todoQueryKeys}
                            isSelected={selectedIds.has(t.id)}
                            onToggleSelect={toggleSelect}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-dashed border-slate-300 dark:border-slate-600 overflow-hidden">
                  <div className="px-5 py-4">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTitle.trim() && !addTodoForPerson.isPending) {
                          addTodoForPerson.mutate(newTitle.trim())
                        }
                      }}
                      placeholder={addTodoForPerson.isPending ? 'Adding...' : '+ Add a todo...'}
                      disabled={addTodoForPerson.isPending}
                      className="w-full text-sm font-medium text-slate-600 dark:text-slate-400 placeholder-slate-300 dark:placeholder-slate-500 bg-transparent outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
        <BulkActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds(new Set())}
          queryKeys={todoQueryKeys}
        />
      </div>

      {showAddPerson && <AddPersonModal onClose={() => setShowAddPerson(false)} />}

      {showTodoModal && (
        <TodoModal
          todo={editingTodo}
          onClose={() => {
            setShowTodoModal(false)
            setEditingTodo(null)
          }}
          invalidateKeys={todoQueryKeys}
          defaultAssigneeId={selectedPersonId ?? undefined}
        />
      )}
    </div>
  )
}
