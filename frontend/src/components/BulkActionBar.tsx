import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPersons, fetchProjects, updateTodo } from '../api'
import type { Person, Project } from '../types'

interface BulkActionBarProps {
  selectedIds: Set<number>
  onClearSelection: () => void
  queryKeys: unknown[][]
}

export default function BulkActionBar({ selectedIds, onClearSelection, queryKeys }: BulkActionBarProps) {
  const queryClient = useQueryClient()
  const [activeAction, setActiveAction] = useState<'person' | 'project' | 'deadline' | null>(null)
  const [deadlineValue, setDeadlineValue] = useState('')

  const { data: persons = [] } = useQuery<Person[]>({ queryKey: ['persons'], queryFn: fetchPersons })
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: fetchProjects })

  const bulkUpdate = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await Promise.all(Array.from(selectedIds).map((id) => updateTodo(id, data)))
    },
    onSuccess: () => {
      queryKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['recently-done'] })
      onClearSelection()
      setActiveAction(null)
      setDeadlineValue('')
    },
  })

  const count = selectedIds.size
  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-4">
      <div className="bg-indigo-600 dark:bg-indigo-700 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold flex-shrink-0">
          {count} selected
        </span>

        <div className="h-5 w-px bg-indigo-400 flex-shrink-0" />

        {/* Assign Person */}
        {activeAction === 'person' ? (
          <select
            autoFocus
            onChange={(e) => {
              const val = e.target.value
              if (val === '') return
              bulkUpdate.mutate({ assignee_id: val === '__none__' ? null : parseInt(val) })
            }}
            onBlur={() => setActiveAction(null)}
            className="text-sm bg-white text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="">Pick a person...</option>
            <option value="__none__">-- Remove assignee --</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setActiveAction('person')}
            disabled={bulkUpdate.isPending}
            className="text-sm bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Assign Person
          </button>
        )}

        {/* Set Project */}
        {activeAction === 'project' ? (
          <select
            autoFocus
            onChange={(e) => {
              const val = e.target.value
              if (val === '') return
              bulkUpdate.mutate({ project_id: val === '__none__' ? null : parseInt(val) })
            }}
            onBlur={() => setActiveAction(null)}
            className="text-sm bg-white text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="">Pick a project...</option>
            <option value="__none__">-- Remove project --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setActiveAction('project')}
            disabled={bulkUpdate.isPending}
            className="text-sm bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Set Project
          </button>
        )}

        {/* Set Deadline */}
        {activeAction === 'deadline' ? (
          <input
            autoFocus
            type="date"
            value={deadlineValue}
            onChange={(e) => {
              setDeadlineValue(e.target.value)
              if (e.target.value) {
                bulkUpdate.mutate({ deadline: e.target.value })
              }
            }}
            onBlur={() => { if (!deadlineValue) setActiveAction(null) }}
            className="text-sm bg-white text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white"
          />
        ) : (
          <button
            onClick={() => setActiveAction('deadline')}
            disabled={bulkUpdate.isPending}
            className="text-sm bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Set Deadline
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={onClearSelection}
          className="text-sm text-indigo-200 hover:text-white font-medium transition-colors flex-shrink-0"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
