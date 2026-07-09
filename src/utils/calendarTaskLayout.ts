import type { Task } from '../types'

export const HOUR_HEIGHT = 60
export const DEFAULT_MIN_TASK_HEIGHT = 30
export const DEFAULT_GUTTER_PERCENT = 1.5

export type CalendarLayoutTask = Pick<Task, 'due_date' | 'end_date'>

export interface CalendarTaskLayoutOptions {
  hourHeight?: number
  minHeight?: number
  gutterPercent?: number
}

export interface CalendarTaskLayout<TTask extends CalendarLayoutTask = Task> {
  task: TTask
  top: number
  height: number
  leftPercent: number
  widthPercent: number
}

interface PositionedTask<TTask extends CalendarLayoutTask> {
  task: TTask
  index: number
  top: number
  height: number
  startMinute: number
  endMinute: number
  column: number
  columnCount: number
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function getTaskStartMinute(task: CalendarLayoutTask): number {
  const dueDate = parseDate(task.due_date)
  return dueDate ? getMinuteOfDay(dueDate) : 0
}

function getTaskDurationMinutes(task: CalendarLayoutTask, minHeight: number, pxPerMinute: number): number {
  const fallbackMinutes = minHeight / pxPerMinute
  const dueDate = parseDate(task.due_date)
  const endDate = parseDate(task.end_date)

  if (!dueDate || !endDate) return fallbackMinutes

  const durationMinutes = (endDate.getTime() - dueDate.getTime()) / 60000
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return fallbackMinutes
  return Math.max(fallbackMinutes, durationMinutes)
}

function buildPositionedTasks<TTask extends CalendarLayoutTask>(
  tasks: readonly TTask[],
  minHeight: number,
  pxPerMinute: number,
): PositionedTask<TTask>[] {
  return tasks.map((task, index) => {
    const startMinute = getTaskStartMinute(task)
    const durationMinutes = getTaskDurationMinutes(task, minHeight, pxPerMinute)

    return {
      task,
      index,
      top: startMinute * pxPerMinute,
      height: durationMinutes * pxPerMinute,
      startMinute,
      endMinute: startMinute + durationMinutes,
      column: 0,
      columnCount: 1,
    }
  })
}

function splitConflictGroups<TTask extends CalendarLayoutTask>(
  positionedTasks: PositionedTask<TTask>[],
): PositionedTask<TTask>[][] {
  const sorted = [...positionedTasks].sort((a, b) => {
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute
    return a.index - b.index
  })

  const groups: PositionedTask<TTask>[][] = []
  let currentGroup: PositionedTask<TTask>[] = []
  let currentGroupEnd = Number.NEGATIVE_INFINITY

  for (const task of sorted) {
    if (currentGroup.length === 0 || task.startMinute < currentGroupEnd) {
      currentGroup.push(task)
      currentGroupEnd = Math.max(currentGroupEnd, task.endMinute)
      continue
    }

    groups.push(currentGroup)
    currentGroup = [task]
    currentGroupEnd = task.endMinute
  }

  if (currentGroup.length > 0) groups.push(currentGroup)
  return groups
}

function assignColumns<TTask extends CalendarLayoutTask>(group: PositionedTask<TTask>[]): void {
  const columnEndMinutes: number[] = []

  for (const task of group) {
    const availableColumn = columnEndMinutes.findIndex((endMinute) => endMinute <= task.startMinute)
    const column = availableColumn === -1 ? columnEndMinutes.length : availableColumn

    task.column = column
    columnEndMinutes[column] = task.endMinute
  }

  const columnCount = columnEndMinutes.length || 1
  for (const task of group) {
    task.columnCount = columnCount
  }
}

export function layoutTimedTasks<TTask extends CalendarLayoutTask = Task>(
  tasks: readonly TTask[],
  options: CalendarTaskLayoutOptions = {},
): CalendarTaskLayout<TTask>[] {
  const hourHeight = options.hourHeight && options.hourHeight > 0 ? options.hourHeight : HOUR_HEIGHT
  const minHeight = options.minHeight && options.minHeight > 0 ? options.minHeight : DEFAULT_MIN_TASK_HEIGHT
  const gutterPercent = options.gutterPercent ?? DEFAULT_GUTTER_PERCENT
  const pxPerMinute = hourHeight / 60
  const positionedTasks = buildPositionedTasks(tasks, minHeight, pxPerMinute)

  for (const group of splitConflictGroups(positionedTasks)) {
    assignColumns(group)
  }

  return positionedTasks
    .sort((a, b) => a.index - b.index)
    .map((positionedTask) => {
      const totalGutterPercent = gutterPercent * (positionedTask.columnCount - 1)
      const widthPercent = (100 - totalGutterPercent) / positionedTask.columnCount
      const leftPercent = positionedTask.column * (widthPercent + gutterPercent)

      return {
        task: positionedTask.task,
        top: positionedTask.top,
        height: positionedTask.height,
        leftPercent,
        widthPercent,
      }
    })
}
