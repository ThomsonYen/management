import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResizableSidebar } from '../hooks/useResizableSidebar'
import { useHotkeys } from '../SettingsContext'
import { useHotkey } from '../hooks/useHotkey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { fetchPersons, fetchTodos, fetchReminders, createPerson, createTodo, deletePerson, updatePerson } from '../api'
import type { Person, Todo, ScheduleStatus } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'
import BulkActionBar from '../components/BulkActionBar'
import EditableMarkdown from '../components/EditableMarkdown'

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
  const [draft, setDraft] = useState(person.notes || '')
  const [showRaw, setShowRaw] = useState(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const serverNotes = person.notes || ''
    if (serverNotes !== draftRef.current) {
      setDraft(serverNotes)
    }
  }, [person.id, person.notes])

  const saveMutation = useMutation({
    mutationFn: (notes: string) => updatePerson(person.id, { notes: notes || undefined }),
  })

  const handleChange = useCallback((md: string) => {
    setDraft(md)
  }, [])

  const handleSave = useCallback((md: string) => {
    saveMutation.mutate(md)
  }, [saveMutation])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Notes</h3>
        <button
          onClick={() => setShowRaw(v => !v)}
          className="text-[10px] font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {showRaw ? 'Hide raw' : 'Raw'}
        </button>
      </div>
      {draft ? (
        <EditableMarkdown value={draft} onChange={handleChange} onSave={handleSave} />
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
          onChange={(e) => { setDraft(e.target.value); saveMutation.mutate(e.target.value) }}
          rows={8}
          className="mt-3 w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
      )}
    </div>
  )
}

export default function PeoplePage({ onOpenTodo }: { onOpenTodo: (id: number) => void }) {
  const queryClient = useQueryClient()
  const { width: panelWidth, collapsed: panelCollapsed, startResize: startPanelResize, toggleCollapsed: togglePanel } = useResizableSidebar('peoplePanelWidth', 256)
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

  const deletePersonMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      setSelectedPersonId(null)
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
        style={{ width: panelCollapsed ? 40 : panelWidth }}
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
            <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">People</h3>
              <button
                onClick={() => setShowAddPerson(true)}
                className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
              >
                + Add
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {persons.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">No people yet</p>
              ) : (
                persons.map((person) => {
                  const count = todoCountByPerson[person.id] || 0
                  const hasAlerts = reminders.some((r) => {
                    const t = allTodos.find((t) => t.id === r.todo_id)
                    return t?.assignee_id === person.id
                  })
                  return (
                    <button
                      key={person.id}
                      onClick={() => setSelectedPersonId(person.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                        selectedPersonId === person.id
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-xs font-bold">
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{person.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {hasAlerts && (
                          <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">{count}</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <div className="px-2 py-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={togglePanel}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Collapse people panel"
              >
                <ChevronsLeft size={16} />
                <span className="text-xs">Collapse</span>
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
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedPersonId ? (
          <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500 text-sm">
            Select a person to view their todos
          </div>
        ) : (
          <>
            {/* Person header */}
            {selectedPerson && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-lg font-bold">
                      {selectedPerson.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{selectedPerson.name}</h2>
                      {selectedPerson.email && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{selectedPerson.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowTodoModal(true)}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      + Add Todo
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this person?')) {
                          deletePersonMutation.mutate(selectedPersonId)
                        }
                      }}
                      className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-4 flex flex-wrap gap-4">
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg px-4 py-2 text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{personTodos.length}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total todos</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg px-4 py-2 text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{totalHours.toFixed(1)}h</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Remaining work</p>
                  </div>
                  {personReminders.filter((r) => r.status === 'behind').length > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/30 rounded-lg px-4 py-2 text-center">
                      <p className="text-lg font-bold text-red-700">
                        {personReminders.filter((r) => r.status === 'behind').length}
                      </p>
                      <p className="text-xs text-red-500">Behind schedule</p>
                    </div>
                  )}
                  {personReminders.filter((r) => r.status === 'warning').length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg px-4 py-2 text-center">
                      <p className="text-lg font-bold text-yellow-700">
                        {personReminders.filter((r) => r.status === 'warning').length}
                      </p>
                      <p className="text-xs text-yellow-500">At risk</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedPerson && <PersonNotes person={selectedPerson} />}

            {/* Schedule alerts for person */}
            {personReminders.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Schedule Alerts
                </h3>
                <div className="space-y-2">
                  {personReminders.map((r) => (
                    <div
                      key={r.todo_id}
                      className={`rounded-lg p-3 border-l-4 text-sm ${
                        r.status === 'behind'
                          ? 'bg-red-50 dark:bg-red-900/30 border-red-500'
                          : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            r.status === 'behind'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {r.status === 'behind' ? 'BEHIND' : 'WARNING'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex gap-3">
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
                    <div key={status} className="mb-6">
                      <h3 className={`text-sm font-bold uppercase tracking-wide mb-2 ${statusColor[status]}`}>
                        {statusLabel[status]} ({todos.length})
                      </h3>
                      <div className="space-y-3">
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
