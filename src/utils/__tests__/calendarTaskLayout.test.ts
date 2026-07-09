import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import { layoutTimedTasks } from '../calendarTaskLayout'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-01-01T00:00:00'
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 2,
    due_date: undefined,
    end_date: undefined,
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

describe('layoutTimedTasks', () => {
  it('将完全重叠的任务分到不同列', () => {
    const first = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })
    const second = makeTask({ id: 2, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })

    const layouts = layoutTimedTasks([first, second])

    expect(layouts[0]).toMatchObject({ task: first, top: 540, height: 60, leftPercent: 0 })
    expect(layouts[0].widthPercent).toBeCloseTo(49.25)
    expect(layouts[1]).toMatchObject({ task: second, top: 540, height: 60 })
    expect(layouts[1].leftPercent).toBeCloseTo(50.75)
    expect(layouts[1].widthPercent).toBeCloseTo(49.25)
  })

  it('将部分重叠的任务作为同一冲突组贪心分列', () => {
    const first = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })
    const second = makeTask({ id: 2, due_date: '2026-01-01T09:30:00', end_date: '2026-01-01T10:30:00' })
    const third = makeTask({ id: 3, due_date: '2026-01-01T10:00:00', end_date: '2026-01-01T11:00:00' })

    const layouts = layoutTimedTasks([first, second, third])

    expect(layouts[0].leftPercent).toBe(0)
    expect(layouts[0].widthPercent).toBeCloseTo(49.25)
    expect(layouts[1].leftPercent).toBeCloseTo(50.75)
    expect(layouts[1].widthPercent).toBeCloseTo(49.25)
    expect(layouts[2].leftPercent).toBe(0)
    expect(layouts[2].widthPercent).toBeCloseTo(49.25)
  })

  it('首尾相接的任务不算重叠', () => {
    const first = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })
    const second = makeTask({ id: 2, due_date: '2026-01-01T10:00:00', end_date: '2026-01-01T11:00:00' })

    const layouts = layoutTimedTasks([first, second])

    expect(layouts[0]).toMatchObject({ leftPercent: 0, widthPercent: 100 })
    expect(layouts[1]).toMatchObject({ leftPercent: 0, widthPercent: 100 })
  })

  it('无结束时间时按默认 30 分钟高度布局', () => {
    const task = makeTask({ due_date: '2026-01-01T12:15:00', end_date: null })

    const [layout] = layoutTimedTasks([task])

    expect(layout).toMatchObject({ top: 735, height: 30, leftPercent: 0, widthPercent: 100 })
  })

  it('无效结束时间时按默认 30 分钟高度布局', () => {
    const task = makeTask({ due_date: '2026-01-01T12:00:00', end_date: 'not-a-date' })

    const [layout] = layoutTimedTasks([task])

    expect(layout).toMatchObject({ top: 720, height: 30, leftPercent: 0, widthPercent: 100 })
  })

  it('无开始时间时 top 为 0 且高度为 30', () => {
    const task = makeTask({ due_date: null, end_date: '2026-01-01T12:00:00' })

    const [layout] = layoutTimedTasks([task])

    expect(layout).toMatchObject({ top: 0, height: 30 })
  })
})
