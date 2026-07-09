import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns'

/** 日历视图模式（月 / 周 / 日 / 甘特图 / 看板 / 日程列表） */
export type ViewMode = 'month' | 'week' | 'day' | 'gantt' | 'kanban' | 'agenda'

/**
 * 日期导航工具函数
 *
 * 这些函数是对 date-fns 的轻量封装，集中管理日历视图的上一段 / 下一段日期计算，
 * 使调用处表达更直观（例如 setCurrentDate(prevMonth(currentDate))）。
 */

/** 上一月 */
export function prevMonth(date: Date): Date {
  return subMonths(date, 1)
}

/** 下一月 */
export function nextMonth(date: Date): Date {
  return addMonths(date, 1)
}

/** 上一周 */
export function prevWeek(date: Date): Date {
  return subWeeks(date, 1)
}

/** 下一周 */
export function nextWeek(date: Date): Date {
  return addWeeks(date, 1)
}

/** 上一天 */
export function prevDay(date: Date): Date {
  return subDays(date, 1)
}

/** 下一天 */
export function nextDay(date: Date): Date {
  return addDays(date, 1)
}
