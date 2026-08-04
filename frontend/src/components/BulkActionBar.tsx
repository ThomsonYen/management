import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPersons, fetchProjects, updateTodo } from '../api'
import type { Person, Project, Todo } from '../types'
import DatePicker from './DatePicker'
import { buildTodoPatch } from '../utils/optimisticTodo'

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

 // The ids are captured into the mutation variables so the selection can be
 // cleared immediately; the caches update optimistically and sync in the
 // background, with onError restoring the pre-mutation snapshot.
 const bulkUpdate = useMutation({
 mutationFn: async ({ ids, data }: { ids: number[]; data: Record<string, unknown> }) => {
 await Promise.all(ids.map((id) => updateTodo(id, data)))
 },
 onMutate: async ({ ids, data }) => {
 onClearSelection()
 setActiveAction(null)
 setDeadlineValue('')
 await queryClient.cancelQueries({ queryKey: ['todos'] })
 const previous = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] })
 const patch = buildTodoPatch(data, persons, projects)
 const idSet = new Set(ids)
 queryClient.setQueriesData<Todo[]>({ queryKey: ['todos'] }, (old) =>
 old?.map((t) => (idSet.has(t.id) ? { ...t, ...patch } : t))
 )
 return { previous }
 },
 onError: (_err, _vars, context) => {
 context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
 },
 onSettled: () => {
 queryKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as string[] }))
 queryClient.invalidateQueries({ queryKey: ['reminders'] })
 queryClient.invalidateQueries({ queryKey: ['recently-done'] })
 },
 })

 const runBulk = (data: Record<string, unknown>) =>
 bulkUpdate.mutate({ ids: Array.from(selectedIds), data })

 const count = selectedIds.size
 if (count === 0) return null

 return (
 <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
 <div className="bg-accent dark:bg-accent-hover text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 flex-wrap">
 <span className="text-sm font-semibold flex-shrink-0">
 {count} selected
 </span>

 <div className="h-5 w-px bg-accent-hover flex-shrink-0" />

 {/* Assign Person */}
 {activeAction === 'person' ? (
 <select
 autoFocus
 onChange={(e) => {
 const val = e.target.value
 if (val === '') return
 runBulk({ assignee_id: val === '__none__' ? null : parseInt(val) })
 }}
 onBlur={() => setActiveAction(null)}
 className="text-sm bg-white text-fg rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white"
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
 className="text-sm bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
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
 runBulk({ project_id: val === '__none__' ? null : parseInt(val) })
 }}
 onBlur={() => setActiveAction(null)}
 className="text-sm bg-white text-fg rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white"
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
 className="text-sm bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
 >
 Set Project
 </button>
 )}

 {/* Set Deadline */}
 {activeAction === 'deadline' ? (
 <DatePicker
 value={deadlineValue}
 onChange={(v) => {
 setDeadlineValue(v)
 if (v) runBulk({ deadline: v })
 }}
 variant="input"
 triggerClassName="!bg-white !text-fg !px-3 !py-1.5 !text-sm !rounded-lg"
 />
 ) : (
 <button
 onClick={() => setActiveAction('deadline')}
 disabled={bulkUpdate.isPending}
 className="text-sm bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
 >
 Set Deadline
 </button>
 )}

 <div className="flex-1" />

 <button
 onClick={onClearSelection}
 className="text-sm text-accent-fg hover:text-white font-medium transition-colors flex-shrink-0"
 >
 Cancel
 </button>
 </div>
 </div>
 )
}
