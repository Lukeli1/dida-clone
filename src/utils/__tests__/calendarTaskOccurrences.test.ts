import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import {
  getOccurrencesForRange,
  groupOccurrencesByDate,
  isTaskAllDayLike,
  isTaskMultiDay,
  splitTaskIntoOccurrences,
} from '../calendarTaskOccurrences'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-01-01T00:00:00'
  return {
    id: 1,
    title: '测试任务',
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

describe('calendar task occurrences', () => {
  it('将跨天任务按本地自然日拆分', () => {
    const task = makeTask({ due_date: '2026-01-01T22:00:00', end_date: '2026-01-03T02:00:00' })

    const occurrences = splitTaskIntoOccurrences(task, new Date(2026, 0, 1), new Date(2026, 0, 3))

    expect(isTaskMultiDay(task)).toBe(true)
    expect(occurrences.map((occurrence) => [occurrence.dateKey, occurrence.segment])).toEqual([
      ['2026-01-01', 'start'],
      ['2026-01-02', 'middle'],
      ['2026-01-03', 'end'],
    ])
    expect(occurrences[0].start.getHours()).toBe(22)
    expect(occurrences[0].end.getHours()).toBe(0)
    expect(occurrences[2].start.getHours()).toBe(0)
    expect(occurrences[2].end.getHours()).toBe(2)
  })

  it('按日期范围裁剪跨天任务片段', () => {
    const task = makeTask({ due_date: '2026-01-01T10:00:00', end_date: '2026-01-04T12:00:00' })

    const occurrences = splitTaskIntoOccurrences(task, new Date(2026, 0, 2), new Date(2026, 0, 3))

    expect(occurrences.map((occurrence) => [occurrence.dateKey, occurrence.segment])).toEqual([
      ['2026-01-02', 'middle'],
      ['2026-01-03', 'middle'],
    ])
    expect(occurrences[0].start.getDate()).toBe(2)
    expect(occurrences[0].start.getHours()).toBe(0)
    expect(occurrences[1].end.getDate()).toBe(4)
    expect(occurrences[1].end.getHours()).toBe(0)
  })

  it('将 00:00 到次日 00:00 推导为单日全天片段', () => {
    const task = makeTask({ due_date: '2026-01-01T00:00:00', end_date: '2026-01-02T00:00:00' })

    const occurrences = splitTaskIntoOccurrences(task, new Date(2026, 0, 1), new Date(2026, 0, 2))

    expect(isTaskAllDayLike(task)).toBe(true)
    expect(isTaskMultiDay(task)).toBe(false)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({ dateKey: '2026-01-01', segment: 'single', isAllDayLike: true })
  })

  it('显式 all_day=true 时不依赖午夜推导进入全天语义', () => {
    const task = makeTask({ due_date: '2026-01-01T09:30:00', end_date: '2026-01-01T10:30:00', all_day: true })

    const occurrences = splitTaskIntoOccurrences(task, new Date(2026, 0, 1), new Date(2026, 0, 1))

    expect(isTaskAllDayLike(task)).toBe(true)
    expect(isTaskMultiDay(task)).toBe(false)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({ dateKey: '2026-01-01', segment: 'single', isAllDayLike: true })
  })

  it('聚合范围内所有任务片段到本地日期 key', () => {
    const singleDayTask = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: null })
    const multiDayTask = makeTask({ id: 2, due_date: '2026-01-01T22:00:00', end_date: '2026-01-02T01:00:00' })

    const occurrences = getOccurrencesForRange([singleDayTask, multiDayTask], new Date(2026, 0, 1), new Date(2026, 0, 2))
    const grouped = groupOccurrencesByDate(occurrences)

    expect(grouped.get('2026-01-01')?.map((occurrence) => occurrence.task.id)).toEqual([1, 2])
    expect(grouped.get('2026-01-02')?.map((occurrence) => occurrence.task.id)).toEqual([2])
  })
})
