import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Person, Project, SubTodo, Todo } from '../types'

// Helpers for optimistic todo edits: patch every cache that holds the todo
// (all ['todos', ...] list variants plus the ['todo', id] detail entry) so the
// UI reflects the change immediately; the mutation's settle-invalidate then
// resyncs with the server, and onError restores the snapshot taken here.

export interface TodoCachesSnapshot {
  lists: Array<[QueryKey, Todo[] | undefined]>
  detail: Todo | undefined
}

export async function snapshotTodoCaches(
  queryClient: QueryClient,
  todoId: number
): Promise<TodoCachesSnapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ['todos'] }),
    queryClient.cancelQueries({ queryKey: ['todo', todoId] }),
  ])
  return {
    lists: queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] }),
    detail: queryClient.getQueryData<Todo>(['todo', todoId]),
  }
}

export function restoreTodoCaches(
  queryClient: QueryClient,
  todoId: number,
  snapshot?: TodoCachesSnapshot
) {
  if (!snapshot) return
  snapshot.lists.forEach(([key, data]) => queryClient.setQueryData(key, data))
  queryClient.setQueryData(['todo', todoId], snapshot.detail)
}

export function patchTodoCaches(queryClient: QueryClient, todoId: number, patch: Partial<Todo>) {
  queryClient.setQueriesData<Todo[]>({ queryKey: ['todos'] }, (old) =>
    old?.map((t) => (t.id === todoId ? { ...t, ...patch } : t))
  )
  queryClient.setQueryData<Todo>(['todo', todoId], (old) => (old ? { ...old, ...patch } : old))
}

export function patchSubtodoCaches(
  queryClient: QueryClient,
  todoId: number,
  map: (subs: SubTodo[]) => SubTodo[]
) {
  queryClient.setQueriesData<Todo[]>({ queryKey: ['todos'] }, (old) =>
    old?.map((t) => (t.id === todoId ? { ...t, subtodos: map(t.subtodos) } : t))
  )
  queryClient.setQueryData<Todo>(['todo', todoId], (old) =>
    old ? { ...old, subtodos: map(old.subtodos) } : old
  )
}

// assignee_name / project_name are derived server-side from the ids; resolve
// them locally so the optimistic row doesn't show the old name until refetch.
export function buildTodoPatch(
  data: Record<string, unknown>,
  persons: Person[],
  projects: Project[]
): Partial<Todo> {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) patch[key] = value ?? undefined
  if ('assignee_id' in data) patch.assignee_name = persons.find((p) => p.id === data.assignee_id)?.name
  if ('project_id' in data) patch.project_name = projects.find((p) => p.id === data.project_id)?.name
  return patch as Partial<Todo>
}
