import type { Task } from '../types'

export type CalendarOccurrenceSegment = 'single' | 'start' | 'middle' | 'end'
export type CalendarOccurrenceTask = Pick<Task, 'due_date' | 'end_date' | 'all_day'>

export interface CalendarOccurrence<TTask extends CalendarOccurrenceTask = Task> {
  task: TTask
  dateKey: string
  start: Date
  end: Date
  segment: CalendarOccurrenceSegment
  isMultiDay: boolean
  isAllDayLike: boolean
}

interface TaskInterval {
  start: Date
  end: Date
  hasDuration: boolean
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null

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

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function maxDate(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

function minDate(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}

function isMidnight(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0
}

function getTaskInterval(task: CalendarOccurrenceTask): TaskInterval | null {
  const start = parseDate(task.due_date)
  if (!start) return null

  const parsedEnd = parseDate(task.end_date)
  if (!parsedEnd || parsedEnd.getTime() <= start.getTime()) {
    return { start, end: start, hasDuration: false }
  }

  return { start, end: parsedEnd, hasDuration: true }
}

function getLastCoveredDate(interval: TaskInterval): Date {
  if (!interval.hasDuration) return interval.start
  return new Date(interval.end.getTime() - 1)
}

function getSegmentForDate(interval: TaskInterval, dateKey: string): CalendarOccurrenceSegment {
  const firstDateKey = toLocalDateKey(interval.start)
  const lastDateKey = toLocalDateKey(getLastCoveredDate(interval))

  if (firstDateKey === lastDateKey) return 'single'
  if (dateKey === firstDateKey) return 'start'
  if (dateKey === lastDateKey) return 'end'
  return 'middle'
}

function getRangeBounds(rangeStart: Date, rangeEnd: Date): { start: Date; endExclusive: Date } | null {
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return null

  const start = startOfLocalDay(rangeStart)
  const endDay = startOfLocalDay(rangeEnd)
  if (endDay.getTime() < start.getTime()) return null

  return { start, endExclusive: addDays(endDay, 1) }
}

export function isTaskMultiDay(task: CalendarOccurrenceTask): boolean {
  const interval = getTaskInterval(task)
  if (!interval || !interval.hasDuration) return false

  return toLocalDateKey(interval.start) !== toLocalDateKey(getLastCoveredDate(interval))
}

export function isTaskAllDayLike(task: CalendarOccurrenceTask): boolean {
  if (task.all_day === true) return true

  const interval = getTaskInterval(task)
  if (!interval || !interval.hasDuration) return false
  if (!isMidnight(interval.start) || !isMidnight(interval.end)) return false

  const startDay = startOfLocalDay(interval.start)
  const endDay = startOfLocalDay(interval.end)
  let durationDays = 0
  for (let day = startDay; day.getTime() < endDay.getTime(); day = addDays(day, 1)) durationDays += 1
  return durationDays >= 1
}

export function splitTaskIntoOccurrences<TTask extends CalendarOccurrenceTask = Task>(
  task: TTask,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence<TTask>[] {
  const interval = getTaskInterval(task)
  const rangeBounds = getRangeBounds(rangeStart, rangeEnd)
  if (!interval || !rangeBounds) return []

  const isMultiDay = isTaskMultiDay(task)
  const isAllDayLike = isTaskAllDayLike(task)

  if (!interval.hasDuration) {
    if (interval.start.getTime() < rangeBounds.start.getTime() || interval.start.getTime() >= rangeBounds.endExclusive.getTime()) {
      return []
    }

    return [
      {
        task,
        dateKey: toLocalDateKey(interval.start),
        start: interval.start,
        end: interval.end,
        segment: 'single',
        isMultiDay,
        isAllDayLike,
      },
    ]
  }

  const clippedStart = maxDate(interval.start, rangeBounds.start)
  const clippedEnd = minDate(interval.end, rangeBounds.endExclusive)
  if (clippedEnd.getTime() <= clippedStart.getTime()) return []

  const occurrences: CalendarOccurrence<TTask>[] = []
  const lastVisibleDay = startOfLocalDay(new Date(clippedEnd.getTime() - 1))

  for (let dayStart = startOfLocalDay(clippedStart); dayStart.getTime() <= lastVisibleDay.getTime(); dayStart = addDays(dayStart, 1)) {
    const dayEnd = addDays(dayStart, 1)
    const occurrenceStart = maxDate(interval.start, rangeBounds.start, dayStart)
    const occurrenceEnd = minDate(interval.end, rangeBounds.endExclusive, dayEnd)

    if (occurrenceEnd.getTime() <= occurrenceStart.getTime()) continue

    const dateKey = toLocalDateKey(dayStart)
    occurrences.push({
      task,
      dateKey,
      start: occurrenceStart,
      end: occurrenceEnd,
      segment: getSegmentForDate(interval, dateKey),
      isMultiDay,
      isAllDayLike,
    })
  }

  return occurrences
}

export function getOccurrencesForRange<TTask extends CalendarOccurrenceTask = Task>(
  tasks: readonly TTask[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence<TTask>[] {
  return tasks.flatMap((task) => splitTaskIntoOccurrences(task, rangeStart, rangeEnd))
}

export function groupOccurrencesByDate<TTask extends CalendarOccurrenceTask = Task>(
  occurrences: readonly CalendarOccurrence<TTask>[],
): Map<string, CalendarOccurrence<TTask>[]> {
  const grouped = new Map<string, CalendarOccurrence<TTask>[]>()

  for (const occurrence of occurrences) {
    const dateOccurrences = grouped.get(occurrence.dateKey) ?? []
    dateOccurrences.push(occurrence)
    grouped.set(occurrence.dateKey, dateOccurrences)
  }

  return grouped
}
