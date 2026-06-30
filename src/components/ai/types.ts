import type { Task } from '../../types'
import type { ActionOp } from '../../utils/llm'

export interface AIAssistantProps {
  tasks: Task[]
  onClose: () => void
  onTasksChange?: () => void  // 任务变更后刷新数据
}

export interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  skillId?: string
  pendingAction?: ActionOp  // 待确认的操作
  isStreaming?: boolean      // 当前正在流式生成中（用于打字机光标）
}

/** 排程预览中的单个日程项 */
export interface ScheduleItem {
  taskId: number
  taskTitle: string
  start: string  // ISO 时间
  end: string    // ISO 时间
  priority: number
}
