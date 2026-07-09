import type { Task } from '../types'
import type { CalendarFilters } from '../stores/calendarStore'
import { isTaskAllDayLike } from './calendarTaskOccurrences'

/**
 * 日历任务过滤纯函数
 *
 * 根据 CalendarFilters 条件过滤任务列表，不读写 store。
 * 过滤逻辑：
 *  - listId: 只保留匹配 list_id 的任务
 *  - tagId: 只保留 tag_ids 包含目标标签的任务
 *  - priority: 只保留匹配优先级的任务
 *  - showCompleted: false 时隐藏 completed=true 的任务
 *  - allDayOnly: true 时只保留 all_day=true 或推导为全天（午夜到午夜）的任务
 */
export function filterCalendarTasks(tasks: readonly Task[], filters: CalendarFilters): Task[] {
  return tasks.filter((task) => {
    // 清单过滤
    if (filters.listId !== null && task.list_id !== filters.listId) return false

    // 标签过滤
    if (filters.tagId !== null) {
      const tagIds = task.tag_ids ?? []
      if (!tagIds.includes(filters.tagId)) return false
    }

    // 优先级过滤
    if (filters.priority !== null && task.priority !== filters.priority) return false

    // 已完成过滤
    if (!filters.showCompleted && task.completed) return false

    // 仅全天过滤：复用 calendarTaskOccurrences 中的推导逻辑
    if (filters.allDayOnly) {
      if (!isTaskAllDayLike(task)) return false
    }

    return true
  })
}
