export interface Person {
  id: number
  name: string
  email?: string
}

export interface Project {
  id: number
  name: string
  description?: string
  notes?: string
  parent_id?: number
  deadline?: string
}

export interface ProjectTree extends Project {
  subprojects: ProjectTree[]
}

export interface SubTodo {
  id: number
  title: string
  done: boolean
  order: number
}

export interface Todo {
  id: number
  title: string
  description?: string
  project_id?: number
  project_name?: string
  assignee_id?: number
  assignee_name?: string
  deadline?: string
  importance: string
  estimated_hours: number
  status: string
  is_blocked: boolean
  is_focused: boolean
  focus_order: number
  created_at: string
  done_at?: string
  subtodos: SubTodo[]
  blocked_by_ids: number[]
}

export interface ScheduleStatus {
  todo_id: number
  title: string
  assignee_name: string
  deadline: string
  estimated_hours: number
  available_hours: number
  chain_hours: number
  status: 'behind' | 'warning'
}

export interface AudioFileInfo {
  filename: string
  size_bytes: number
  created_at: string
}

export interface MeetingNote {
  id: number
  title: string
  date: string
  filename: string
  content: string
  created_at: string
  updated_at: string
  attendee_ids: number[]
  attendee_names: string[]
  project_ids: number[]
  project_names: string[]
  todo_ids: number[]
  todo_titles: string[]
  transcript: string | null
  audio_files: AudioFileInfo[]
}

export interface MeetingNoteSummary {
  id: number
  title: string
  date: string
  created_at: string
  updated_at: string
  attendee_names: string[]
  project_names: string[]
  todo_count: number
}

export interface MeetingTemplate {
  name: string
  content: string
}

export interface MeetingNoteSearchResult {
  id: number
  title: string
  date: string
  snippet: string
}

export interface PersonProgressBucket {
  period: string
  task_count: number
  total_hours: number
}

export interface PersonProgress {
  person_id: number
  person_name: string
  buckets: PersonProgressBucket[]
  total_task_count: number
  total_hours: number
}
