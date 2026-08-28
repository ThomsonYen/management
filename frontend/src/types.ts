export interface Person {
  id: number
  name: string
  email?: string
  notes?: string
  display_order?: number
  deleted_at?: string
  project_ids: number[]
  project_names: string[]
  is_direct_report?: boolean
  check_in_interval_days?: number
  /** YYYY-MM-DD */
  last_check_in_date?: string | null
}

export interface Project {
  id: number
  name: string
  description?: string
  notes?: string
  parent_id?: number
  deadline?: string
  deleted_at?: string
  display_order: number
  importance: string
  board_hidden: boolean
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
  deleted_at?: string
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

export type NoteKind = 'personal' | 'meeting'

export interface Note {
  id: number
  title: string
  filename?: string | null
  kind: NoteKind
  content: string
  created_at: string
  updated_at: string
  tags: string[]
  date?: string | null
  attendee_ids: number[]
  attendee_names: string[]
  project_ids: number[]
  project_names: string[]
  todo_ids: number[]
  todo_titles: string[]
  transcript?: string | null
  audio_files: AudioFileInfo[]
  vault_id?: number | null
  vault_name?: string | null
  vault_root_path?: string | null
  relative_path?: string | null
  content_unavailable?: boolean
}

export interface NoteSummary {
  id: number
  title: string
  kind: NoteKind
  created_at: string
  updated_at: string
  tags: string[]
  date?: string | null
  attendee_names: string[]
  project_names: string[]
  todo_count: number
}

export interface NoteSearchResult {
  id: number
  title: string
  kind: NoteKind
  snippet: string
  date?: string | null
}

export interface TagOut {
  name: string
  note_count: number
}

export type ApiTokenScope = 'read' | 'write:todos' | 'write:persons' | 'write:notes' | 'write:daily'

export interface ApiToken {
  id: number
  name: string
  scopes: ApiTokenScope[]
  created_at: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface ApiTokenCreated extends ApiToken {
  token: string // shown once
}

export interface ApiAuditEntry {
  id: number
  ts: string
  method: string
  path: string
  status: number
  body: string
}

export interface Vault {
  id: number
  name: string
  root_path: string
  is_managed: boolean
  created_at: string
  last_scan_at?: string | null
  note_count: number
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
