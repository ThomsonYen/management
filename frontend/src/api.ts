import axios from 'axios'
import type { Person, Project, ProjectTree, Todo, SubTodo, ScheduleStatus } from './types'

const api = axios.create({
  baseURL: '/api',
})

// ─── Persons ─────────────────────────────────────────────────────────────────

export const fetchPersons = (): Promise<Person[]> =>
  api.get('/persons').then((r) => r.data)

export const createPerson = (data: { name: string; email?: string }): Promise<Person> =>
  api.post('/persons', data).then((r) => r.data)

export const deletePerson = (id: number): Promise<void> =>
  api.delete(`/persons/${id}`).then((r) => r.data)

// ─── Projects ────────────────────────────────────────────────────────────────

export const fetchProjects = (): Promise<Project[]> =>
  api.get('/projects').then((r) => r.data)

export const fetchProjectTree = (): Promise<ProjectTree[]> =>
  api.get('/projects/tree').then((r) => r.data)

export const createProject = (data: {
  name: string
  description?: string
  parent_id?: number
  deadline?: string
}): Promise<Project> => api.post('/projects', data).then((r) => r.data)

export const updateProject = (
  id: number,
  data: { name?: string; description?: string; parent_id?: number; deadline?: string },
): Promise<Project> => api.put(`/projects/${id}`, data).then((r) => r.data)

export const deleteProject = (id: number): Promise<void> =>
  api.delete(`/projects/${id}`).then((r) => r.data)

// ─── Todos ───────────────────────────────────────────────────────────────────

export interface TodoFilters {
  assignee_id?: number
  project_id?: number
  status?: string
  exclude_done?: boolean
  is_focused?: boolean
}

export const fetchTodos = (filters?: TodoFilters): Promise<Todo[]> =>
  api.get('/todos', { params: filters }).then((r) => r.data)

export const fetchTodo = (id: number): Promise<Todo> =>
  api.get(`/todos/${id}`).then((r) => r.data)

export const createTodo = (data: {
  title: string
  description?: string
  project_id?: number
  assignee_id?: number | null
  deadline?: string
  importance?: string
  estimated_hours?: number
  status?: string
  blocked_by_ids?: number[]
}): Promise<Todo> => api.post('/todos', data).then((r) => r.data)

export const updateTodo = (
  id: number,
  data: {
    title?: string
    description?: string
    project_id?: number
    assignee_id?: number | null
    deadline?: string
    importance?: string
    estimated_hours?: number
    status?: string
    is_focused?: boolean
    blocked_by_ids?: number[]
  },
): Promise<Todo> => api.put(`/todos/${id}`, data).then((r) => r.data)

export const deleteTodo = (id: number): Promise<void> =>
  api.delete(`/todos/${id}`).then((r) => r.data)

// ─── SubTodos ────────────────────────────────────────────────────────────────

export const createSubTodo = (
  todoId: number,
  data: { title: string; done?: boolean; order?: number },
): Promise<SubTodo> => api.post(`/todos/${todoId}/subtodos`, data).then((r) => r.data)

export const updateSubTodo = (
  id: number,
  data: { title?: string; done?: boolean; order?: number },
): Promise<SubTodo> => api.put(`/subtodos/${id}`, data).then((r) => r.data)

export const deleteSubTodo = (id: number): Promise<void> =>
  api.delete(`/subtodos/${id}`).then((r) => r.data)

export const fetchRecentlyDone = (limit = 50): Promise<Todo[]> =>
  api.get('/todos/recently-done', { params: { limit } }).then((r) => r.data)

// ─── Schedule ────────────────────────────────────────────────────────────────

export const fetchReminders = (): Promise<ScheduleStatus[]> =>
  api.get('/schedule/reminders').then((r) => r.data)
