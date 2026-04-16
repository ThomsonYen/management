import axios from 'axios'
import type { Person, PersonProgress, Project, ProjectTree, Todo, SubTodo, ScheduleStatus, MeetingNote, MeetingNoteSummary, MeetingTemplate, MeetingNoteSearchResult, AudioFileInfo } from './types'

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

export const fetchPersonProgress = (
  granularity: 'day' | 'week' | 'month' = 'week',
  since?: string,
  tz?: string,
): Promise<PersonProgress[]> =>
  api.get('/persons/progress', { params: { granularity, since, tz } }).then((r) => r.data)

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

export const restoreProject = (id: number): Promise<void> =>
  api.post(`/projects/${id}/restore`).then((r) => r.data)

export const purgeProject = (id: number): Promise<void> =>
  api.delete(`/projects/${id}/purge`).then((r) => r.data)

export const fetchDeletedProjects = (): Promise<Project[]> =>
  api.get('/projects/deleted').then((r) => r.data)

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

export const restoreTodo = (id: number): Promise<void> =>
  api.post(`/todos/${id}/restore`).then((r) => r.data)

export const purgeTodo = (id: number): Promise<void> =>
  api.delete(`/todos/${id}/purge`).then((r) => r.data)

export const fetchDeletedTodos = (): Promise<Todo[]> =>
  api.get('/todos/deleted').then((r) => r.data)

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

export const fetchRecentlyDone = (params: { limit?: number; since?: string } = {}): Promise<Todo[]> =>
  api.get('/todos/recently-done', { params: { limit: 50, ...params } }).then((r) => r.data)

// ─── Must Do Items ──────────────────────────────────────────────────────────

export interface MustDoItem {
  id: number
  date: string
  todo_id?: number
  text: string
  done: boolean
  order: number
  section: string  // morning | afternoon | evening
}

export const fetchMustDoItems = (date: string): Promise<MustDoItem[]> =>
  api.get(`/must-do/${date}`).then((r) => r.data)

export const createMustDoItem = (
  date: string,
  data: { todo_id?: number; text: string; done?: boolean; order?: number; section?: string },
): Promise<MustDoItem> => api.post(`/must-do/${date}`, data).then((r) => r.data)

export const updateMustDoItem = (
  id: number,
  data: { text?: string; done?: boolean; order?: number; section?: string; todo_id?: number },
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
    transcript?: string
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

// ─── Meeting Note Audio ────────────────────────────────────────────────────

export const uploadAudio = (noteId: number, file: Blob, filename?: string): Promise<AudioFileInfo> => {
  const formData = new FormData()
  formData.append('file', file, filename || 'recording.webm')  // backend converts to mp3
  return api.post(`/meeting-notes/${noteId}/audio`, formData).then((r) => r.data)
}

export const deleteAudio = (noteId: number, filename: string): Promise<void> =>
  api.delete(`/meeting-notes/${noteId}/audio/${filename}`).then((r) => r.data)

export const getAudioDownloadUrl = (noteId: number, filename: string): string =>
  `/api/meeting-notes/${noteId}/audio/${filename}/download`

export const transcribeMeetingNote = (noteId: number): Promise<{ transcript: string }> =>
  api.post(`/meeting-notes/${noteId}/transcribe`).then((r) => r.data)

export const suggestTodos = (noteId: number): Promise<{ suggestions: { title: string; description: string }[] }> =>
  api.post(`/meeting-notes/${noteId}/suggest-todos`).then((r) => r.data)

// ─── Daily Goals ───────────────────────────────────────────────────────────

export interface DailyGoal {
  id: number
  date: string
  content: string
  updated_at: string
}

export const fetchDailyGoals = (dateFrom: string, dateTo: string): Promise<DailyGoal[]> =>
  api.get('/daily-goals', { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data)

export const upsertDailyGoal = (date: string, content: string): Promise<DailyGoal> =>
  api.put(`/daily-goals/${date}`, { content }).then((r) => r.data)

// ─── Config ────────────────────────────────────────────────────────────────

export interface UserSettings {
  timezone: string | null
  theme: 'light' | 'dark'
  meeting_note_sort: 'created_at' | 'updated_at'
  todo_defaults: {
    assignee_name: string
    deadline_to_today: boolean
    estimated_hours: string
    importance: string
  }
  hotkeys: Record<string, string>
}

export type UserSettingsPatch = Partial<Omit<UserSettings, 'todo_defaults' | 'hotkeys'>> & {
  todo_defaults?: Partial<UserSettings['todo_defaults']>
  hotkeys?: Record<string, string>
}

export const fetchSettings = (): Promise<UserSettings> =>
  api.get('/config/settings').then((r) => r.data)

export const updateSettings = (patch: UserSettingsPatch): Promise<UserSettings> =>
  api.put('/config/settings', patch).then((r) => r.data)

// ─── Backup ────────────────────────────────────────────────────────────────

export const runBackup = (): Promise<{ date: string; snapshot: string }> =>
  api.post('/backup/run').then((r) => r.data)
