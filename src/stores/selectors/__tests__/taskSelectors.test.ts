import { describe, it, expect } from 'vitest'
import { selectTodayCount, selectArchivedCount, selectTaskCounts, selectOverdueTasks } from '../taskSelectors'
import type { Task } from '../../../types'

// 使用相对当前日期，避免 isToday/isBefore 依赖系统时钟导致测试随日期漂移
const now = new Date()
const TODAY = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0).toISOString()
const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 10, 0, 0)
const PAST = pastDate.toISOString()

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '测试任务',
    priority: 0,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    sort_order: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    tag_ids: [],
    ...overrides,
  }
}

describe('selectTodayCount', () => {
  it('统计今日未完成且未归档的任务数', () => {
    const tasks = [
      makeTask({ id: 1, due_date: TODAY }),
      makeTask({ id: 2, due_date: TODAY, completed: true }),
      makeTask({ id: 3, due_date: TODAY, archived: true }),
      makeTask({ id: 4, due_date: PAST }),
      makeTask({ id: 5 }),
    ]
    expect(selectTodayCount(tasks)).toBe(1)
  })

  it('空数组返回 0', () => {
    expect(selectTodayCount([])).toBe(0)
  })
})

describe('selectArchivedCount', () => {
  it('统计已归档任务数', () => {
    const tasks = [
      makeTask({ id: 1, archived: true }),
      makeTask({ id: 2, archived: true }),
      makeTask({ id: 3, archived: false }),
    ]
    expect(selectArchivedCount(tasks)).toBe(2)
  })
})

describe('selectTaskCounts', () => {
  it('按清单统计未完成任务数', () => {
    const tasks = [
      makeTask({ id: 1, list_id: 1 }),
      makeTask({ id: 2, list_id: 1 }),
      makeTask({ id: 3, list_id: 2 }),
      makeTask({ id: 4, list_id: 1, completed: true }),
    ]
    const counts = selectTaskCounts(tasks)
    expect(counts[1]).toBe(2)
    expect(counts[2]).toBe(1)
  })
})

describe('selectOverdueTasks', () => {
  it('返回过期未完成任务，按置顶/优先级/截止日期排序', () => {
    const tasks = [
      makeTask({ id: 1, due_date: PAST, priority: 2 }),
      makeTask({ id: 2, due_date: PAST, priority: 1, pinned: true }),
      makeTask({ id: 3, due_date: PAST, completed: true }),
      makeTask({ id: 4, due_date: TODAY }),
    ]
    const overdue = selectOverdueTasks(tasks)
    expect(overdue).toHaveLength(2)
    // 置顶任务排前
    expect(overdue[0].id).toBe(2)
    expect(overdue[1].id).toBe(1)
  })

  it('无过期任务返回空数组', () => {
    const tasks = [makeTask({ id: 1, due_date: TODAY })]
    expect(selectOverdueTasks(tasks)).toHaveLength(0)
  })

  it('priority 为 0 时按最低优先级处理（排后）', () => {
    const tasks = [makeTask({ id: 1, due_date: PAST, priority: 0 }), makeTask({ id: 2, due_date: PAST, priority: 2 })]
    const overdue = selectOverdueTasks(tasks)
    expect(overdue[0].id).toBe(2)
    expect(overdue[1].id).toBe(1)
  })
})
