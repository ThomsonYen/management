import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPersons, fetchTodos, fetchReminders, createPerson, deletePerson } from '../api'
import type { Person, Todo, ScheduleStatus } from '../types'
import TodoCard from '../components/TodoCard'
import TodoModal from '../components/TodoModal'

const STATUS_ORDER = ['todo', 'in-progress', 'blocked', 'done']

const statusLabel: Record<string, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

const statusColor: Record<string, string> = {
  todo: 'text-slate-600',
  'in-progress': 'text-blue-600',
  blocked: 'text-red-600',
  done: 'text-green-600',
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Add Person</h3>
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PeoplePage() {
  const queryClient = useQueryClient()
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showTodoModal, setShowTodoModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)

  const { data: persons = [] } = useQuery<Person[]>({
    queryKey: ['persons'],
    queryFn: fetchPersons,
  })

  const { data: allTodos = [] } = useQuery<Todo[]>({
    queryKey: ['todos'],
    queryFn: () => fetchTodos(),
  })

  const { data: personTodos = [], isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ['todos', 'person', selectedPersonId],
    queryFn: () => fetchTodos({ assignee_id: selectedPersonId! }),
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
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">People</h3>
          <button
            onClick={() => setShowAddPerson(true)}
            className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
          >
            + Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {persons.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">No people yet</p>
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
                      ? 'bg-indigo-100 text-indigo-800 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
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
                    <span className="text-xs text-slate-400 font-normal">{count}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedPersonId ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            Select a person to view their todos
          </div>
        ) : (
          <>
            {/* Person header */}
            {selectedPerson && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-lg font-bold">
                      {selectedPerson.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">{selectedPerson.name}</h2>
                      {selectedPerson.email && (
                        <p className="text-sm text-slate-500">{selectedPerson.email}</p>
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
                  <div className="bg-slate-50 rounded-lg px-4 py-2 text-center">
                    <p className="text-lg font-bold text-slate-800">{personTodos.length}</p>
                    <p className="text-xs text-slate-500">Total todos</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg px-4 py-2 text-center">
                    <p className="text-lg font-bold text-slate-800">{totalHours.toFixed(1)}h</p>
                    <p className="text-xs text-slate-500">Remaining work</p>
                  </div>
                  {personReminders.filter((r) => r.status === 'behind').length > 0 && (
                    <div className="bg-red-50 rounded-lg px-4 py-2 text-center">
                      <p className="text-lg font-bold text-red-700">
                        {personReminders.filter((r) => r.status === 'behind').length}
                      </p>
                      <p className="text-xs text-red-500">Behind schedule</p>
                    </div>
                  )}
                  {personReminders.filter((r) => r.status === 'warning').length > 0 && (
                    <div className="bg-yellow-50 rounded-lg px-4 py-2 text-center">
                      <p className="text-lg font-bold text-yellow-700">
                        {personReminders.filter((r) => r.status === 'warning').length}
                      </p>
                      <p className="text-xs text-yellow-500">At risk</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Schedule alerts for person */}
            {personReminders.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Schedule Alerts
                </h3>
                <div className="space-y-2">
                  {personReminders.map((r) => (
                    <div
                      key={r.todo_id}
                      className={`rounded-lg p-3 border-l-4 text-sm ${
                        r.status === 'behind'
                          ? 'bg-red-50 border-red-500'
                          : 'bg-yellow-50 border-yellow-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{r.title}</span>
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
                      <div className="text-xs text-slate-500 mt-1 flex gap-3">
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
              <div className="text-slate-500 text-sm">Loading...</div>
            ) : (
              STATUS_ORDER.map((status) => {
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
                          queryKeys={todoQueryKeys}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
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
        />
      )}
    </div>
  )
}
