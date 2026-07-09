import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import { getAllDaySegmentsForDays } from '../calendarAllDaySegments'
import { getOccurrencesForRange } from '../calendarTaskOccurrences'

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  const now = '2026-01-01T00:00:00'
  return {
    id,
    title: `测试任务 ${id}`,
    notes: '',
    priority: 2,
    due_date: undefined,
    end_date: undefined,
    all_day: false,
    reminder: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: undefined,
    repeat_rule: undefined,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

const week = Array.from({ length: 7 }, (_, index) => new Date(2026, 0, 5 + index))

describe('calendar all-day segments', () => {
  it('合并同一任务的连续日期片段并计算跨度', () => {
    const task = makeTask(1, {
      due_date: '2026-01-06T00:00:00',
      end_date: '2026-01-09T00:00:00',
      all_day: true,
    })
    const occurrences = getOccurrencesForRange([task], week[0], week[6])

    const segments = getAllDaySegmentsForDays(week, occurrences)

    expect(segments).toEqual([
      expect.objectContaining({ task, startIndex: 1, span: 3, rowIndex: 0, segment: 'single' }),
    ])
  })

  it('为重叠条带分配不同渲染行', () => {
    const first = makeTask(1, {
      due_date: '2026-01-05T00:00:00',
      end_date: '2026-01-08T00:00:00',
      all_day: true,
    })
    const second = makeTask(2, {
      due_date: '2026-01-06T00:00:00',
      end_date: '2026-01-07T00:00:00',
      all_day: true,
    })
    const occurrences = getOccurrencesForRange([second, first], week[0], week[6])

    const segments = getAllDaySegmentsForDays(week, occurrences)

    expect(segments.map((segment) => [segment.task.id, segment.startIndex, segment.span, segment.rowIndex])).toEqual([
      [1, 0, 3, 0],
      [2, 1, 1, 1],
    ])
  })

  it('保留跨周裁剪后的中间片段状态', () => {
    const task = makeTask(1, {
      due_date: '2026-01-03T00:00:00',
      end_date: '2026-01-09T00:00:00',
      all_day: true,
    })
    const occurrences = getOccurrencesForRange([task], week[0], week[6])

    const segments = getAllDaySegmentsForDays(week, occurrences)

    expect(segments[0]).toMatchObject({ startIndex: 0, span: 4, segment: 'end' })
  })
})
