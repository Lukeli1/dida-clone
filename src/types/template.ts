export interface TaskTemplate {
  id: number
  name: string
  description?: string
  icon?: string
  title_template: string
  notes_template?: string
  priority: number
  reminder_minutes?: number
  subtask_templates: SubtaskTemplate[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SubtaskTemplate {
  id: number
  template_id: number
  title: string
  sort_order: number
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  icon?: string
  title_template: string
  notes_template?: string
  priority?: number
  reminder_minutes?: number
  subtask_templates: { title: string; sort_order?: number }[]
}

export interface UpdateTemplateRequest {
  id: number
  name?: string
  description?: string
  icon?: string
  title_template?: string
  notes_template?: string
  priority?: number
  reminder_minutes?: number
  subtask_templates?: { title: string; sort_order?: number }[]
}

/**
 * 应用模板请求。
 * - templateId / listId：必填
 * - dueDate / tagIds / variables：可选增强字段；不传时后端保持旧行为
 */
export interface ApplyTemplateRequest {
  templateId: number
  listId: number
  /** 截止日期；未设置或空串表示不写日期 */
  dueDate?: string | null
  /** 主任务标签；未设置或空数组表示不挂标签 */
  tagIds?: number[]
  /** 模板变量映射，如 { project: 'Alpha' } */
  variables?: Record<string, string>
}

/** 传给后端 apply_template 的可选增强字段（与 ApplyTemplateOptions 对齐） */
export interface ApplyTemplateOptions {
  dueDate?: string | null
  tagIds?: number[]
  variables?: Record<string, string>
}
