import axios from 'axios'
import type { Person, Project, ProjectTree, Todo, SubTodo, ScheduleStatus, MeetingNote, MeetingNoteSummary, MeetingTemplate, MeetingNoteSearchResult } from './types'

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
  notes?: string
  parent_id?: number
  deadline?: string
}): Promise<Project> => api.post('/projects', data).then((r) => r.data)

export const updateProject = (
  id: number,
  data: { name?: string; description?: string; notes?: string; parent_id?: number; deadline?: string },
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
    focus_order?: number
    blocked_by_ids?: number[]
  },
): Promise<Todo> => api.put(`/todos/${id}`, data).then((r) => r.data)

export const reorderFocus = (
  items: { id: number; focus_order: number }[],
): Promise<void> => api.put('/todos/reorder-focus', items).then((r) => r.data)

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

// ─── Must Do Items ──────────────────────────────────────────────────────────

export interface MustDoItem {
  id: number
  date: string
  todo_id?: number
  text: string
  done: boolean
  order: number
}

export const fetchMustDoItems = (date: string): Promise<MustDoItem[]> =>
  api.get(`/must-do/${date}`).then((r) => r.data)

export const createMustDoItem = (
  date: string,
  data: { todo_id?: number; text: string; done?: boolean; order?: number },
): Promise<MustDoItem> => api.post(`/must-do/${date}`, data).then((r) => r.data)

export const updateMustDoItem = (
  id: number,
  data: { text?: string; done?: boolean; order?: number },
): Promise<MustDoItem> => api.put(`/must-do/items/${id}`, data).then((r) => r.data)

export const deleteMustDoItem = (id: number): Promise<void> =>
  api.delete(`/must-do/items/${id}`).then((r) => r.data)

// ─── Schedule ────────────────────────────────────────────────────────────────

export const fetchReminders = (): Promise<ScheduleStatus[]> =>
  api.get('/schedule/reminders').then((r) => r.data)

// ─── Meeting Notes ──────────────────────────────────────────────────────────

export interface MeetingNoteFilters {
  person_id?: number
  project_id?: number
  todo_id?: number
  date_from?: string
  date_to?: string
}

export const fetchMeetingNotes = (filters?: MeetingNoteFilters): Promise<MeetingNoteSummary[]> =>
  api.get('/meeting-notes', { params: filters }).then((r) => r.data)

export const fetchMeetingNote = (id: number): Promise<MeetingNote> =>
  api.get(`/meeting-notes/${id}`).then((r) => r.data)

export const createMeetingNote = (data: {
  title: string
  date: string
  content?: string
  attendee_ids?: number[]
  project_ids?: number[]
  todo_ids?: number[]
  template?: string
}): Promise<MeetingNote> => api.post('/meeting-notes', data).then((r) => r.data)

export const updateMeetingNote = (
  id: number,
  data: {
    title?: string
    date?: string
    content?: string
    attendee_ids?: number[]
    project_ids?: number[]
    todo_ids?: number[]
  },
): Promise<MeetingNote> => api.put(`/meeting-notes/${id}`, data).then((r) => r.data)

export const deleteMeetingNote = (id: number): Promise<void> =>
  api.delete(`/meeting-notes/${id}`).then((r) => r.data)

export const restoreMeetingNote = (id: number): Promise<void> =>
  api.post(`/meeting-notes/${id}/restore`).then((r) => r.data)

export const fetchHiddenMeetingNotes = (): Promise<MeetingNoteSummary[]> =>
  api.get('/meeting-notes-hidden').then((r) => r.data)

export const searchHiddenMeetingNotes = (q: string): Promise<MeetingNoteSearchResult[]> =>
  api.get('/meeting-notes-hidden/search', { params: { q } }).then((r) => r.data)

export const searchMeetingNotes = (q: string): Promise<MeetingNoteSearchResult[]> =>
  api.get('/meeting-notes/search', { params: { q } }).then((r) => r.data)

export const fetchMeetingTemplates = (): Promise<MeetingTemplate[]> =>
  api.get('/meeting-templates').then((r) => r.data)
