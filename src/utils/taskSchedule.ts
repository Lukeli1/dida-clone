import type { Task } from '../types'

const MINUTE_MS = 60 * 1000
const DEFAULT_TIMED_DURATION_MS = 60 * MINUTE_MS
const DAY_MS = 24 * 60 * MINUTE_MS

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

/** 统一的本地日期解析入口：纯日期按本地自然日，其他按本地时间；非法值返回 null。 */
export function parseTaskDate(value: string | null | undefined): Date | null {
  return parseDate(value)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地 datetime-local 输入值（YYYY-MM-DDTHH:mm）；空值 / 非法值返回空字符串 */
export function toLocalDateTimeInputValue(iso?: string | null): string {
  const date = parseDate(iso)
  if (!date) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}`
}

/** 本地 date 输入值（YYYY-MM-DD）；空值 / 非法值返回空字符串 */
export function toLocalDateInputValue(iso?: string | null): string {
  const date = parseDate(iso)
  if (!date) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 在本地自然日上加减天数，返回 YYYY-MM-DD；非法输入返回空字符串。 */
export function addDaysToLocalDateKey(dateKey: string, days: number): string {
  const date = parseDate(dateKey)
  if (!date) return ''
  return toLocalDateInputValue(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).toISOString())
}

/** 将本地日期 key 与 HH:mm 组合为本地时间 ISO；非法输入返回 null。 */
export function localDateKeyWithTimeToIso(dateKey: string, time: string): string | null {
  const date = parseDate(dateKey)
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!date || !match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).toISOString()
}

/** 全天任务可见结束日（YYYY-MM-DD）转为排他结束时间（次日本地 00:00）。 */
export function visibleAllDayEndToExclusiveIso(visibleEndDateKey: string): string | null {
  const date = parseDate(visibleEndDateKey)
  if (!date) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString()
}

/**
 * 全天任务的原跨度（天，含开始日）：
 * - 结束为排他 00:00 时按自然日差计算
 * - 结束缺失 / 无效 / 不晚于开始日：按单天
 */
export function getAllDayTaskSpanDays(task: Pick<Task, 'due_date' | 'end_date'>): number {
  const start = parseDate(task.due_date)
  const end = parseDate(task.end_date)
  if (!start || !end) return 1

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const diffDays = Math.round((endDay.getTime() - startDay.getTime()) / DAY_MS)
  return diffDays >= 1 ? diffDays : 1
}

/** 全天编辑中的可见结束日期：排他性的 00:00 结束时间取前一天；非零点的定时结束时间取当天。 */
export function getVisibleAllDayEndDateInput(endIso?: string | null): string {
  const date = parseDate(endIso)
  if (!date) return ''
  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0) {
    return toLocalDateInputValue(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).toISOString())
  }
  return toLocalDateInputValue(date.toISOString())
}

/**
 * 全天任务跨度（天，含开始日）：
 * - 可见结束日合法且不早于开始日：按可见结束日计算
 * - 可见结束日为空：单天
 * - 可见结束日早于开始日（用户改了开始日）：回退到任务原跨度
 */
export function getAllDaySpanDays(
  task: Pick<Task, 'due_date' | 'end_date'>,
  startLocal: Date,
  visibleEndDateKey: string,
): number {
  if (visibleEndDateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(visibleEndDateKey)
    if (match) {
      const [, year, month, day] = match
      const endVisible = new Date(Number(year), Number(month) - 1, Number(day))
      const span = Math.round((endVisible.getTime() - startLocal.getTime()) / DAY_MS) + 1
      if (span >= 1) return span
    }
  } else {
    return 1
  }

  const oldStart = parseDate(task.due_date)
  const oldEnd = parseDate(task.end_date)
  if (oldStart && oldEnd) {
    const oldStartLocal = new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate())
    const oldEndLocal = new Date(oldEnd.getFullYear(), oldEnd.getMonth(), oldEnd.getDate())
    const diffDays = Math.round((oldEndLocal.getTime() - oldStartLocal.getTime()) / DAY_MS)
    if (diffDays >= 1) return diffDays
  }
  return 1
}

/**
 * 全天日程保存 Patch：
 * - due_date 为开始日本地 00:00
 * - end_date 为可见结束日次日本地 00:00（排他）
 * - 开始日期为空时同步清空 due_date / end_date
 * - 开始日期非法时返回 null，调用方保留输入且不写入
 */
export function buildAllDaySchedulePatch(
  task: Pick<Task, 'due_date' | 'end_date'>,
  dueDateIso: string,
  visibleEndDateKey: string,
): Partial<Task> | null {
  if (!dueDateIso) return { all_day: true, due_date: null, end_date: null }

  const parsed = parseDate(dueDateIso)
  if (!parsed) return null

  const startLocal = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  const spanDays = getAllDaySpanDays(task, startLocal, visibleEndDateKey)
  const endLocal = new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate() + spanDays)

  return {
    all_day: true,
    due_date: startLocal.toISOString(),
    end_date: endLocal.toISOString(),
  }
}

/**
 * 定时日程保存 Patch：
 * - 有有效结束时间：起止成对保存
 * - 无结束时间：不自动补 end_date（undefined 表示不更新）；用户显式清除时发送 null
 * - 结束时间不晚于开始时间且是本次新输入：返回 null，调用方保留输入
 * - 历史遗留的非法结束时间：只更新 due_date，不静默清空旧值
 */
export function buildTimedSchedulePatch(
  task: Pick<Task, 'due_date' | 'end_date'>,
  dueDateIso: string,
  endDateIso: string,
): Partial<Task> | null {
  const dueValue = dueDateIso || null
  if (dueValue && !parseDate(dueValue)) return null

  let endPatch: string | null | undefined

  if (!dueValue) {
    endPatch = task.end_date || endDateIso ? null : undefined
  } else if (endDateIso) {
    const dueDate = parseDate(dueValue)
    const endDate = parseDate(endDateIso)
    if (!dueDate || !endDate) return null
    if (endDate.getTime() <= dueDate.getTime()) {
      // 用户刚改成非法区间：保留输入并展示错误，不写入。
      // 历史遗留的非法结束时间：不静默清空，本次只更新开始时间。
      if (endDateIso !== (task.end_date || '')) return null
      endPatch = undefined
    } else {
      endPatch = endDateIso
    }
  } else {
    endPatch = task.end_date ? null : undefined
  }

  return {
    due_date: dueValue,
    all_day: false,
    ...(endPatch !== undefined ? { end_date: endPatch } : {}),
  }
}

function isLocalMidnight(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0
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
