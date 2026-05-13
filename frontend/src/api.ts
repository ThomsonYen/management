import axios from 'axios'
import type { Person, PersonProgress, Project, ProjectTree, Todo, SubTodo, ScheduleStatus, AudioFileInfo, Note, NoteKind, NoteSummary, NoteSearchResult, TagOut, Vault } from './types'

const api = axios.create({
  baseURL: '/api',
})

// ─── Persons ─────────────────────────────────────────────────────────────────

export const fetchPersons = (): Promise<Person[]> =>
  api.get('/persons').then((r) => r.data)

export const createPerson = (data: { name: string; email?: string; notes?: string; project_ids?: number[] }): Promise<Person> =>
  api.post('/persons', data).then((r) => r.data)

export const updatePerson = (
  id: number,
  data: { name?: string; email?: string; notes?: string; project_ids?: number[] },
): Promise<Person> => api.put(`/persons/${id}`, data).then((r) => r.data)

export const deletePerson = (id: number): Promise<void> =>
  api.delete(`/persons/${id}`).then((r) => r.data)

export const restorePerson = (id: number): Promise<void> =>
  api.post(`/persons/${id}/restore`).then((r) => r.data)

export const purgePerson = (id: number): Promise<void> =>
  api.delete(`/persons/${id}/purge`).then((r) => r.data)

export const fetchArchivedPersons = (): Promise<Person[]> =>
  api.get('/persons/deleted').then((r) => r.data)

export const reorderPersons = (
  items: { id: number; display_order: number }[],
): Promise<void> => api.put('/persons/reorder', items).then((r) => r.data)

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

// ─── Notes (unified personal + meeting note model) ─────────────────────────

export interface NoteFilters {
  kind?: NoteKind
  tag?: string
  person_id?: number
  project_id?: number
  todo_id?: number
  date_from?: string
  date_to?: string
}

export const fetchNotes = (filters?: NoteFilters): Promise<NoteSummary[]> =>
  api.get('/notes', { params: filters }).then((r) => r.data)

export const fetchTags = (kind?: NoteKind): Promise<TagOut[]> =>
  api.get('/tags', { params: kind ? { kind } : undefined }).then((r) => r.data)

export const fetchNote = (id: number): Promise<Note> =>
  api.get(`/notes/${id}`).then((r) => r.data)

export const createNote = (data: {
  title: string
  content?: string
  kind?: NoteKind
  date?: string
  attendee_ids?: number[]
  project_ids?: number[]
  todo_ids?: number[]
  template?: string
}): Promise<Note> => api.post('/notes', data).then((r) => r.data)

export const updateNote = (
  id: number,
  data: {
    title?: string
    content?: string
    date?: string
    attendee_ids?: number[]
    project_ids?: number[]
    todo_ids?: number[]
    transcript?: string
  },
): Promise<Note> => api.put(`/notes/${id}`, data).then((r) => r.data)

export const uploadNoteAudio = (noteId: number, file: Blob, filename?: string): Promise<AudioFileInfo> => {
  const formData = new FormData()
  formData.append('file', file, filename || 'recording.webm')
  return api.post(`/notes/${noteId}/audio`, formData).then((r) => r.data)
}

export const deleteNoteAudio = (noteId: number, filename: string): Promise<void> =>
  api.delete(`/notes/${noteId}/audio/${filename}`).then((r) => r.data)

export const getNoteAudioDownloadUrl = (noteId: number, filename: string): string =>
  `/api/notes/${noteId}/audio/${filename}/download`

export const transcribeNote = (noteId: number): Promise<{ transcript: string }> =>
  api.post(`/notes/${noteId}/transcribe`).then((r) => r.data)

export const suggestNoteTodos = (noteId: number): Promise<{ suggestions: { title: string; description: string }[] }> =>
  api.post(`/notes/${noteId}/suggest-todos`).then((r) => r.data)

export const deleteNote = (id: number): Promise<void> =>
  api.delete(`/notes/${id}`).then((r) => r.data)

export const restoreNote = (id: number): Promise<void> =>
  api.post(`/notes/${id}/restore`).then((r) => r.data)

export const purgeNote = (id: number): Promise<void> =>
  api.delete(`/notes/${id}/purge`).then((r) => r.data)

export const searchNotes = (q: string, kind?: NoteKind): Promise<NoteSearchResult[]> =>
  api.get('/notes/search', { params: { q, ...(kind ? { kind } : {}) } }).then((r) => r.data)

export const fetchHiddenNotes = (kind?: NoteKind): Promise<NoteSummary[]> =>
  api.get('/notes-hidden', { params: kind ? { kind } : undefined }).then((r) => r.data)

export const searchHiddenNotes = (q: string, kind?: NoteKind): Promise<NoteSearchResult[]> =>
  api.get('/notes-hidden/search', { params: { q, ...(kind ? { kind } : {}) } }).then((r) => r.data)

// ─── Vaults (Phase 4 — connect external Obsidian folders) ──────────────────

export const fetchVaults = (): Promise<Vault[]> =>
  api.get('/vaults').then((r) => r.data)

export const createVault = (data: { name: string; root_path: string }): Promise<Vault> =>
  api.post('/vaults', data).then((r) => r.data)

export const deleteVault = (id: number): Promise<void> =>
  api.delete(`/vaults/${id}`).then((r) => r.data)

export const rescanVault = (id: number): Promise<Vault> =>
  api.post(`/vaults/${id}/rescan`).then((r) => r.data)

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
