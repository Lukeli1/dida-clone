import { format } from 'date-fns'
import type { Task } from '../types'
import type { CalendarOccurrence, CalendarOccurrenceTask } from './calendarTaskOccurrences'

export interface CalendarAllDaySegment<TTask extends CalendarOccurrenceTask & { id: number } = Task> {
  task: TTask
  startIndex: number
  span: number
  rowIndex: number
  segment: CalendarOccurrence<TTask>['segment']
}

function getSegmentKind<TTask extends CalendarOccurrenceTask & { id: number }>(
  first: CalendarOccurrence<TTask>,
  last: CalendarOccurrence<TTask>,
): CalendarOccurrence<TTask>['segment'] {
  if (first.segment === 'start' && last.segment === 'end') return 'single'
  if (first.segment === 'start') return 'start'
  if (last.segment === 'end') return 'end'
  return first.segment === 'single' && last.segment === 'single' ? 'single' : 'middle'
}

export function getAllDaySegmentsForDays<TTask extends CalendarOccurrenceTask & { id: number } = Task>(
  days: Date[],
  occurrences: CalendarOccurrence<TTask>[],
): CalendarAllDaySegment<TTask>[] {
  const dayIndexByKey = new Map(days.map((day, index) => [format(day, 'yyyy-MM-dd'), index]))
  const occurrencesByTask = new Map<number, CalendarOccurrence<TTask>[]>()

  for (const occurrence of occurrences) {
    if (!dayIndexByKey.has(occurrence.dateKey)) continue
    const taskOccurrences = occurrencesByTask.get(occurrence.task.id) || []
    taskOccurrences.push(occurrence)
    occurrencesByTask.set(occurrence.task.id, taskOccurrences)
  }

  const segments: CalendarAllDaySegment<TTask>[] = []
  occurrencesByTask.forEach((taskOccurrences) => {
    const sorted = [...taskOccurrences].sort((a, b) => dayIndexByKey.get(a.dateKey)! - dayIndexByKey.get(b.dateKey)!)
    let run: CalendarOccurrence<TTask>[] = []
    let previousIndex = -1

    for (const occurrence of sorted) {
      const index = dayIndexByKey.get(occurrence.dateKey)!
      if (run.length > 0 && index !== previousIndex + 1) {
        const first = run[0]
        const last = run[run.length - 1]
        const startIndex = dayIndexByKey.get(first.dateKey)!
        segments.push({
          task: first.task,
          startIndex,
          span: dayIndexByKey.get(last.dateKey)! - startIndex + 1,
          rowIndex: 0,
          segment: getSegmentKind(first, last),
        })
        run = []
      }
      run.push(occurrence)
      previousIndex = index
    }

    if (run.length > 0) {
      const first = run[0]
      const last = run[run.length - 1]
      const startIndex = dayIndexByKey.get(first.dateKey)!
      segments.push({
        task: first.task,
        startIndex,
        span: dayIndexByKey.get(last.dateKey)! - startIndex + 1,
        rowIndex: 0,
        segment: getSegmentKind(first, last),
      })
    }
  })

  const rowEndIndexes: number[] = []
  return segments
    .sort((a, b) => a.startIndex - b.startIndex || b.span - a.span || a.task.id - b.task.id)
    .map((segment) => {
      const rowIndex = rowEndIndexes.findIndex((endIndex) => endIndex < segment.startIndex)
      const nextRowIndex = rowIndex === -1 ? rowEndIndexes.length : rowIndex
      rowEndIndexes[nextRowIndex] = segment.startIndex + segment.span - 1
      return { ...segment, rowIndex: nextRowIndex }
    })
}
