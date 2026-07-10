import type { Task } from '../../types'

export interface AIAssistantProps {
  tasks: Task[]
  onClose: () => void
  onTasksChange?: () => Promise<void> | void // 任务变更后刷新数据
}

export interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  skillId?: string
  /** 待确认的 AI 动作预览（已校验） */
  pendingPreview?: import('../../utils/aiActionSafety').ValidationResult | null
  isStreaming?: boolean // 当前正在流式生成中（用于打字机光标）
}

/** 排程预览中的单个日程项（保留向后兼容） */
export interface ScheduleItem {
  taskId: number
  taskTitle: string
  start: string // ISO 时间
  end: string // ISO 时间
  priority: number
}
