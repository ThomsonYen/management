export interface Person {
  id: number
  name: string
  email?: string
}

export interface Project {
  id: number
  name: string
  description?: string
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
