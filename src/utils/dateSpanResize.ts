import type { Task } from '../types'
import { isTaskAllDayLike } from './calendarTaskOccurrences'

/**
 * 周视图左右边缘「日期跨度调整」的共用日期语义。
 *
 * 只负责「把某一端的覆盖日改到目标自然日」这一件事，与像素、指针、组件解耦：
 * - 全天（或整天跨度）任务：目标日 = 包含该日；排他结束持久化为次日本地 00:00
 * - 定时任务：对应端点保留原有时分，all_day 不参与补丁（保持 false 语义）
 * - 无有效 end_date 的单时间任务：右拉以原时分作为目标日期的结束时分；
 *   左拉保留原计划时刻作为结束端点；未拉伸不自动补 end_date
 * - 开始不能晚于结束；覆盖范围无有效变化时不产生补丁
 * - 仅写入发生变化的字段，复用既有 updateTask API，不新增数据结构
 *
 * 覆盖日的判定与 calendarTaskOccurrences 保持一致：
 * 有持续时长时最后覆盖日 = end - 1ms 的本地自然日（次日 00:00 的排他结束只占当天）。
 */

export type DateSpanResizeEdge = 'start' | 'end'

export interface DateSpanBounds {
  /** 开始覆盖日（本地自然日 yyyy-MM-dd，含） */
  startKey: string
  /** 结束覆盖日（本地自然日 yyyy-MM-dd，含） */
  endKey: string
}

export interface DateSpanResizeResult {
  /** 调整后的覆盖范围（本地自然日，含两端） */
  startKey: string
  endKey: string
  /** 传给 updateTask 的增量补丁；只含发生变化的字段 */
  patch: { due_date?: string; end_date?: string | null }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null

  // 与 calendarTaskOccurrences / taskSchedule 保持一致：纯日期按本地自然日解析
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** 目标自然日 + 源时刻的时分（保持端点原有时分） */
function datetimeOn(targetDay: Date, timeSource: Date): Date {
  return new Date(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate(), timeSource.getHours(), timeSource.getMinutes(), 0, 0)
}

/** 有持续时长时的最后覆盖日：end - 1ms 的本地自然日 */
function lastCoveredDayKey(end: Date): string {
  return toLocalDateKey(new Date(end.getTime() - 1))
}

export function getTaskSpanBounds(task: Pick<Task, 'due_date' | 'end_date'>): DateSpanBounds | null {
  const start = parseDate(task.due_date)
  if (!start) return null

  const end = parseDate(task.end_date)
  const hasDuration = !!end && end.getTime() > start.getTime()
  const startKey = toLocalDateKey(start)
  return { startKey, endKey: hasDuration ? lastCoveredDayKey(end) : startKey }
}

/**
 * 计算「把 task 的某一端调整到 targetDay 自然日」后的补丁。
 * 返回 null 表示无有效变化或会形成无效区间，调用方不应写入。
 */
export function computeDateSpanResizePatch(
  task: Pick<Task, 'due_date' | 'end_date' | 'all_day'>,
  edge: DateSpanResizeEdge,
  targetDay: Date,
): DateSpanResizeResult | null {
  const bounds = getTaskSpanBounds(task)
  const start = parseDate(task.due_date)
  if (!bounds || !start) return null

  const parsedEnd = parseDate(task.end_date)
  const end = parsedEnd && parsedEnd.getTime() > start.getTime() ? parsedEnd : null
  const { startKey, endKey } = bounds
  const targetKey = toLocalDateKey(targetDay)

  let nextStart = start
  let nextEnd: Date | null = end

  if (isTaskAllDayLike(task)) {
    // 全天（或整天跨度）语义：覆盖到目标日，排他结束 = 次日本地 00:00
    if (edge === 'start') {
      if (targetKey > endKey) return null
      nextStart = startOfDay(targetDay)
      if (!end) nextEnd = addDays(startOfDay(start), 1)
    } else {
      if (targetKey < startKey) return null
      nextEnd = addDays(startOfDay(targetDay), 1)
    }
  } else {
    // 定时语义：对应端点保留原有时分
    if (edge === 'start') {
      if (targetKey === startKey) return null
      if (targetKey > startKey) {
        // 起点右移（收窄）：无 end 的单时间任务只能左移；移动后不得越过结束时刻
        if (!end || targetKey > endKey || datetimeOn(targetDay, start).getTime() >= end.getTime()) return null
      }
      nextStart = datetimeOn(targetDay, start)
      if (!end) nextEnd = start
    } else {
      if (targetKey < endKey) {
        // 终点左移（收窄）：无 end 无可收窄；移动后不得早于等于开始时刻
        if (!end || targetKey < startKey || datetimeOn(targetDay, end).getTime() <= start.getTime()) return null
        nextEnd = datetimeOn(targetDay, end)
      } else if (targetKey === endKey) {
        return null
      } else {
        // 终点右移（扩展）：无 end 时以原时分作为目标日期的结束时分
        nextEnd = datetimeOn(targetDay, end ?? start)
      }
    }
  }

  const nextStartKey = toLocalDateKey(nextStart)
  const nextEndKey = nextEnd ? lastCoveredDayKey(nextEnd) : nextStartKey

  const patch: { due_date?: string; end_date?: string | null } = {}
  if (nextStart.getTime() !== start.getTime()) patch.due_date = nextStart.toISOString()
  if ((nextEnd?.getTime() ?? null) !== (end?.getTime() ?? null)) {
    patch.end_date = nextEnd ? nextEnd.toISOString() : null
  }
  if (Object.keys(patch).length === 0) return null
  if (nextStartKey === startKey && nextEndKey === endKey) return null

  return { startKey: nextStartKey, endKey: nextEndKey, patch }
}
