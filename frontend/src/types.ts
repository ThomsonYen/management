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
  deprecated_at?: string | null
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

export type SocialStatus =
  | 'planned'
  | 'needs_confirm'
  | 'never'
  | 'ok'
  | 'due_soon'
  | 'slipping'
  | 'overdue'

export type HangoutStatus = 'planned' | 'happened'

export interface Friend {
  id: number
  name: string
  notes: string | null
  cadence_days: number
  last_hangout_date: string | null
  display_order: number
  deleted_at: string | null
  /** Derived server-side — never recompute these in the UI. */
  days_since_hangout: number | null
  days_until_due: number | null
  status: SocialStatus
  /** The cadence tier ignoring any plan — "overdue, but you're seeing them Friday". */
  cadence_tier: SocialStatus
  hangout_count: number
  last_hangout_what: string | null
  next_plan_date: string | null
  next_plan_what: string | null
  next_plan_id: number | null
  days_until_plan: number | null
  unconfirmed_plan_id: number | null
  unconfirmed_plan_date: string | null
}

export interface Hangout {
  id: number
  date: string
  what_we_did: string | null
  status: HangoutStatus
  friend_ids: number[]
  friend_names: string[]
  created_at: string | null
}

export type ApiTokenScope = 'read' | 'write:todos' | 'write:persons' | 'write:notes' | 'write:daily' | 'write:social'

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

// ─── Accounts & access (multi-user) ─────────────────────────────────────────

export type Role = 'owner' | 'member'
export type AccessLevel = 'view' | 'edit'
export type GrantKind = 'project' | 'note'

export interface AccessGrant {
  id: number
  kind: GrantKind
  target_id: number
  target_name: string | null
}

export interface AppUser {
  id: number
  username: string
  role: Role
  person_id: number | null
  person_name: string | null
  access_level: AccessLevel
  see_attended_meetings: boolean
  is_active: boolean
  created_at: string | null
  last_seen_at: string | null
  grants: AccessGrant[]
}

export interface Invite {
  id: number
  person_id: number
  person_name: string
  created_at: string
  expires_at: string
}

export interface InviteCreated extends Invite {
  token: string // shown once; the link is `${origin}/invite/${token}`
}

export interface UsersOverview {
  users: AppUser[]
  invites: Invite[]
}

export interface InvitePreview {
  person_name: string
  expires_at: string
}
