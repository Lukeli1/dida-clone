import type { Task } from '../types'
import { getVisibleAllDayEndDateInput, parseTaskDate } from './taskSchedule'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 任务日期摘要的展示数据。
 *
 * 所有日期比较都按本地自然日进行，避免 ISO 字符串直接按 UTC 日期比较造成跨时区偏移。
 * 过期只按“截止自然日早于今天”判断：今天、明天以及未过期日期不会显示为逾期。
 */
export interface TaskDueDateDisplay {
  /** 月日；全天跨日显示为「11月5日 - 11月7日」 */
  dateLabel: string
  /** 昨天 / 延期X天；未过期或已完成时为 null */
  relativeLabel: string | null
  /** 定时任务的开始时间（HH:mm）；全天任务为 null */
  timeLabel: string | null
  /** 定时任务的起止时间；无结束时间时与 timeLabel 相同 */
  timeRangeLabel: string | null
  /** 仅未完成且截止自然日早于今天时为 true */
  isOverdue: boolean
  /** 逾期自然日数；未逾期为 0 */
  overdueDays: number
  isCompleted: boolean
  /** 完整摘要，例如「11月9日，昨天，17:00」 */
  text: string
  /** 稳定可访问名称，例如「截止日期 11月9日，昨天，17:00」 */
  ariaLabel: string
}

type TaskDateSource = Pick<Task, 'due_date' | 'end_date' | 'all_day' | 'completed'>

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * 生成任务日期摘要。
 *
 * - 全天任务：跨度按可见结束日（含当天）展示，逾期锚点为结束日
 * - 定时任务：显示开始时间；有有效结束时间时同时显示起止时间
 * - 已完成任务：保留日期/时间，但不显示逾期文案与红色状态
 */
export function getTaskDueDateDisplay(task: TaskDateSource, now: Date = new Date()): TaskDueDateDisplay | null {
  const due = parseTaskDate(task.due_date)
  if (!due) return null

  const dueDay = startOfLocalDay(due)
  const allDay = task.all_day === true
  const completed = task.completed === true

  let dateLabel = formatMonthDay(due)
  let deadlineDay = dueDay

  if (allDay) {
    const visibleEnd = parseTaskDate(getVisibleAllDayEndDateInput(task.end_date))
    if (visibleEnd) {
      const visibleEndDay = startOfLocalDay(visibleEnd)
      if (visibleEndDay.getTime() > dueDay.getTime()) {
        dateLabel = `${formatMonthDay(due)} - ${formatMonthDay(visibleEndDay)}`
        deadlineDay = visibleEndDay
      }
    }
  }

  const timeLabel = allDay ? null : formatTime(due)
  let timeRangeLabel = timeLabel
  if (!allDay) {
    const end = parseTaskDate(task.end_date)
    if (end && end.getTime() > due.getTime()) {
      const sameDay = startOfLocalDay(end).getTime() === dueDay.getTime()
      timeRangeLabel = `${timeLabel} - ${sameDay ? formatTime(end) : `${formatMonthDay(end)} ${formatTime(end)}`}`
    }
  }

  const today = startOfLocalDay(now)
  const overdueDays = completed ? 0 : Math.max(0, Math.round((today.getTime() - deadlineDay.getTime()) / DAY_MS))
  const relativeLabel = overdueDays <= 0 ? null : overdueDays === 1 ? '昨天' : `延期${overdueDays}天`
  const isOverdue = relativeLabel !== null

  const text = [dateLabel, relativeLabel, timeRangeLabel].filter(Boolean).join('，')
  const ariaLabel = `截止日期 ${[dateLabel, relativeLabel, timeRangeLabel].filter(Boolean).join('，')}`

  return {
    dateLabel,
    relativeLabel,
    timeLabel,
    timeRangeLabel,
    isOverdue,
    overdueDays,
    isCompleted: completed,
    text,
    ariaLabel,
  }
}
