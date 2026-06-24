export interface Task {
  id: number
  title: string
  notes?: string
  priority: number
  due_date?: string
  reminder?: string
  completed: boolean
  list_id: number
  parent_id?: number
  repeat_rule?: string
  created_at: string
  updated_at: string
  tag_ids?: number[]
  subtasks?: Task[]
}

export interface List {
  id: number
  name: string
  color?: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  name: string
  color?: string
  created_at: string
}

export interface CreateTaskRequest {
  title: string
  notes?: string
  priority?: number
  due_date?: string
  reminder?: string
  list_id: number
  parent_id?: number
  repeat_rule?: string
}

export interface CreateListRequest {
  name: string
  color?: string
  is_default?: boolean
}

export interface UpdateListRequest {
  name?: string
  color?: string
}

export interface CreateTagRequest {
  name: string
  color?: string
}
