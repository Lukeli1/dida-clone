// 日历视图间共享的类型定义
import type { Task } from '../../../types'

/** 在时间范围内创建任务时携带的数据（月/周/日视图通用） */
export interface CreateTaskOnRangeData {
  dateKey: string
  title: string
  notes?: string
  priority: number
  listId: number
  startHour: number
  startMin: number
  endHour: number
  endMin: number
}

/** 在时间范围内创建任务的回调签名 */
export type CreateTaskOnRange = (data: CreateTaskOnRangeData) => void

/** 跨日期移动任务的回调签名 */
export type MoveTask = (taskId: number, newDate: string) => void

/** 更新任务字段的回调签名 */
export type UpdateTask = (taskId: number, updates: Partial<Task>) => void
