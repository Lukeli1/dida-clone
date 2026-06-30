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
