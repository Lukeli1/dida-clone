import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import { filterCalendarTasks } from '../calendarFilters'
import { defaultCalendarFilters } from '../../stores/calendarStore'

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00'
  return {
    id,
    title: `任务 ${id}`,
    notes: '',
    priority: 0,
    due_date: '2026-07-03T09:00:00',
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

describe('filterCalendarTasks', () => {
  it('默认条件不过滤任何任务', () => {
    const tasks = [makeTask(1), makeTask(2, { completed: true }), makeTask(3, { priority: 1 })]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters })
    expect(result).toHaveLength(3)
  })

  it('按清单过滤：只保留匹配 list_id 的任务', () => {
    const tasks = [makeTask(1, { list_id: 1 }), makeTask(2, { list_id: 2 }), makeTask(3, { list_id: 1 })]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters, listId: 1 })
    expect(result.map((t) => t.id)).toEqual([1, 3])
  })

  it('按标签过滤：只保留 tag_ids 包含目标标签的任务', () => {
    const tasks = [
      makeTask(1, { tag_ids: [10, 20] }),
      makeTask(2, { tag_ids: [30] }),
      makeTask(3, { tag_ids: [] }),
      makeTask(4, { tag_ids: [20] }),
    ]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters, tagId: 20 })
    expect(result.map((t) => t.id)).toEqual([1, 4])
  })

  it('按优先级过滤：只保留匹配 priority 的任务', () => {
    const tasks = [
      makeTask(1, { priority: 0 }),
      makeTask(2, { priority: 1 }),
      makeTask(3, { priority: 2 }),
      makeTask(4, { priority: 1 }),
    ]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters, priority: 1 })
    expect(result.map((t) => t.id)).toEqual([2, 4])
  })

  it('隐藏已完成任务', () => {
    const tasks = [
      makeTask(1, { completed: false }),
      makeTask(2, { completed: true }),
      makeTask(3, { completed: false }),
    ]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters, showCompleted: false })
    expect(result.map((t) => t.id)).toEqual([1, 3])
  })

  it('仅全天过滤：保留 all_day=true 的任务', () => {
    const tasks = [
      makeTask(1, { all_day: true }),
      makeTask(2, { all_day: false }),
      makeTask(3, { all_day: true }),
    ]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters, allDayOnly: true })
    expect(result.map((t) => t.id)).toEqual([1, 3])
  })

  it('仅全天过滤：也保留午夜到午夜的推导全天任务', () => {
    const tasks = [
      makeTask(1, { due_date: '2026-07-03T00:00:00', end_date: '2026-07-04T00:00:00', all_day: false }),
      makeTask(2, { due_date: '2026-07-03T09:00:00', end_date: '2026-07-03T10:00:00', all_day: false }),
    ]
    const result = filterCalendarTasks(tasks, { ...defaultCalendarFilters, allDayOnly: true })
    expect(result.map((t) => t.id)).toEqual([1])
  })

  it('组合过滤：清单 + 优先级 + 隐藏已完成', () => {
    const tasks = [
      makeTask(1, { list_id: 1, priority: 1, completed: false }),
      makeTask(2, { list_id: 1, priority: 1, completed: true }),
      makeTask(3, { list_id: 1, priority: 2, completed: false }),
      makeTask(4, { list_id: 2, priority: 1, completed: false }),
    ]
    const result = filterCalendarTasks(tasks, {
      ...defaultCalendarFilters,
      listId: 1,
      priority: 1,
      showCompleted: false,
    })
    expect(result.map((t) => t.id)).toEqual([1])
  })

  it('空任务列表返回空数组', () => {
    const result = filterCalendarTasks([], { ...defaultCalendarFilters })
    expect(result).toEqual([])
  })
})
