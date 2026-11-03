import type { Task } from '../types'

const MINUTE_MS = 60 * 1000
const DEFAULT_TIMED_DURATION_MS = 60 * MINUTE_MS

/** 从任务的截止/结束时间生成 due_date Patch，保证修改日期时起止语义一致。 */
export interface DueDatePatch {
  due_date: string | null
  /** undefined = 不更新 end_date；null = 显式清空 */
  end_date?: string | null
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null

  // 与 calendarTaskOccurrences 保持一致：纯日期按本地自然日解析，避免被当成 UTC 午夜。
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isLocalMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  )
}

/**
 * 修改 due_date 时的起止语义：
 * - 清空日期：同步清空 end_date，避免留下孤儿结束时间
 * - 原结束时间有效：非全天保持原持续时长；全天（或整天跨度）转为 1 小时定时块，
 *   避免把“下一天 00:00”的排他结束时间原样带入定时任务
 * - 无结束时间或原结束时间无效：只更新 due_date，不自动补结束时间
 */
export function buildDueDatePatch(
  task: Pick<Task, 'due_date' | 'end_date' | 'all_day'>,
  nextDueDate: string | null,
): DueDatePatch {
  if (!nextDueDate) return { due_date: null, end_date: null }

  const nextStart = parseDate(nextDueDate)
  if (!nextStart) return { due_date: nextDueDate }

  const oldStart = parseDate(task.due_date)
  const oldEnd = parseDate(task.end_date)
  if (!oldStart || !oldEnd || oldEnd.getTime() <= oldStart.getTime()) {
    return { due_date: nextDueDate }
  }

  const wholeDaySpan = task.all_day === true || (isLocalMidnight(oldStart) && isLocalMidnight(oldEnd))
  const duration = wholeDaySpan ? DEFAULT_TIMED_DURATION_MS : oldEnd.getTime() - oldStart.getTime()

  return {
    due_date: nextDueDate,
    end_date: new Date(nextStart.getTime() + duration).toISOString(),
  }
}
