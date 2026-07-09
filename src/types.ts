export interface Task {
  id: number
  title: string
  /** 数据库 NULL 对应 null；旧数据/未设置时可能为 undefined */
  notes?: string | null
  priority: number
  due_date?: string | null
  end_date?: string | null
  all_day?: boolean
  reminder?: string | null
  reminder_minutes?: number
  completed: boolean
  archived?: boolean
  pinned?: boolean
  list_id: number
  parent_id?: number | null
  repeat_rule?: string | null
  sort_order: number
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
  parent_id?: number
  created_at: string
}

export interface CreateTaskRequest {
  title: string
  notes?: string
  priority?: number
  due_date?: string
  end_date?: string
  all_day?: boolean
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
  parent_id?: number
}

export interface ReorderItem {
  id: number
  sort_order: number
}

export interface UpdateTaskRequest {
  title?: string
  /** null = 清空（存 NULL），undefined = 不更新，字符串 = 更新 */
  notes?: string | null
  priority?: number
  /** null = 清空（存 NULL），undefined = 不更新，字符串 = 更新 */
  due_date?: string | null
  /** null = 清空（存 NULL），undefined = 不更新，字符串 = 更新 */
  end_date?: string | null
  all_day?: boolean
  /** null = 清空（存 NULL），undefined = 不更新，字符串 = 更新 */
  reminder?: string | null
  reminder_minutes?: number
  completed?: boolean
  archived?: boolean
  pinned?: boolean
  list_id?: number
  /** null = 清空（存 NULL），undefined = 不更新，数字 = 更新 */
  parent_id?: number | null
  /** null = 清空（存 NULL），undefined = 不更新，字符串 = 更新 */
  repeat_rule?: string | null
  sort_order?: number
}

export interface CompleteResult {
  new_task_id: number | null
}

/* ============ AI 对话相关类型 ============ */

/**
 * AI 对话消息（与后端 src-tauri/src/llm.rs 的 ChatMessage 结构体对齐）。
 * 用于流式对话 llm_chat_stream 的 messages 参数。
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/* ============ 习惯打卡（Habit）相关类型 ============ */

/** 习惯（与后端 db.rs 中的 Habit 结构体对齐，蛇形命名） */
export interface Habit {
  id: number
  name: string
  icon?: string
  icon_color?: string
  frequency?: string
  frequency_days?: string
  target_count: number
  unit?: string
  start_date?: string
  color?: string
  sort_order: number
  archived: boolean
  created_at: string
  updated_at: string
}

/** 习惯打卡记录（与后端 HabitRecord 结构体对齐） */
export interface HabitRecord {
  id: number
  habit_id: number
  date: string
  count: number
  note?: string
  created_at: string
}

/** 创建习惯请求体 */
export interface CreateHabitRequest {
  name: string
  icon?: string
  icon_color?: string
  frequency?: string
  frequency_days?: string
  target_count?: number
  unit?: string
  start_date?: string
  color?: string
  sort_order?: number
}

/** 更新习惯请求体（所有字段可选） */
export interface UpdateHabitRequest {
  name?: string
  icon?: string
  icon_color?: string
  frequency?: string
  frequency_days?: string
  target_count?: number
  unit?: string
  start_date?: string
  color?: string
  sort_order?: number
}
