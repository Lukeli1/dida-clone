/**
 * 任务派生数据 selectors（P3-13）
 *
 * 从 taskStore 的 tasks 派生：今日计数、归档计数、过期任务等纯计算逻辑。
 * 抽为纯函数便于单元测试，避免与 React hook 耦合。
 */

import { isToday, isBefore, startOfDay } from 'date-fns'
import type { Task } from '../../types'

/** 今日未完成且未归档的任务数 */
export function selectTodayCount(tasks: Task[]): number {
  return tasks.filter((t) => !t.completed && !t.archived && t.due_date && isToday(new Date(t.due_date))).length
}

/** 已归档任务数 */
export function selectArchivedCount(tasks: Task[]): number {
  return tasks.filter((t) => t.archived).length
}

/** 各清单未完成任务计数 */
export function selectTaskCounts(tasks: Task[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const t of tasks) {
    if (!t.completed) counts[t.list_id] = (counts[t.list_id] || 0) + 1
  }
  return counts
}

/** 过期未完成任务（今日/全部视图用） */
export function selectOverdueTasks(tasks: Task[]): Task[] {
  const todayStart = startOfDay(new Date())
  return tasks
    .filter((t) => {
      if (!t.due_date || t.completed) return false
      return isBefore(new Date(t.due_date), todayStart)
    })
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      const pa = a.priority === 0 ? 4 : a.priority
      const pb = b.priority === 0 ? 4 : b.priority
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      return b.created_at.localeCompare(a.created_at)
    })
}
