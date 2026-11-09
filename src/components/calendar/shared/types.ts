// 日历视图间共享的类型定义
import type { Task } from '../../../types'

/** 在时间范围内创建任务时携带的数据（日/周视图通用） */
export interface CreateTaskOnRangeData {
  startDateKey: string
  startMinute: number
  /** 全天模式为排他结束日期（结束日次日），定时模式为结束日期 */
  endDateKey: string
  endMinute: number
  /** true：创建全天任务，日期按本地 00:00 整天语义处理 */
  allDay?: boolean
  title: string
  notes?: string
  priority: number
  listId: number
}

/** 在时间范围内创建任务；false 表示创建失败并应保留创建表单 */
export type CreateTaskOnRange = (data: CreateTaskOnRangeData) => boolean | void | Promise<boolean | void>

export interface MoveTaskOptions {
  allDay?: boolean
}

/** 跨日期移动任务的回调签名 */
export type MoveTask = (taskId: number, newDate: string, options?: MoveTaskOptions) => void

/** 更新任务字段的回调签名 */
export type UpdateTask = (taskId: number, updates: Partial<Task>) => void
