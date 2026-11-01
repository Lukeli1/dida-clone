import { beforeEach, describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import {
  CALENDAR_TASK_DRAG_ACTION_OPTIONS,
  DEFAULT_CALENDAR_TASK_DRAG_ACTIONS,
  buildClearTaskDateUpdate,
  buildMoveOverdueTaskToNowUpdate,
  getCalendarTaskDragActions,
  normalizeCalendarTaskDragActions,
  saveCalendarTaskDragActions,
} from '../calendarTaskDragActions'
import { STORAGE_KEYS } from '../../config/localStorageKeys'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '测试任务',
    priority: 0,
    due_date: '2026-07-01T09:00:00.000Z',
    end_date: null,
    all_day: false,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('日历任务拖拽动作配置', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  })

  it('默认左侧置顶、右侧删除', () => {
    expect(DEFAULT_CALENDAR_TASK_DRAG_ACTIONS).toEqual({ left: 'pin', right: 'delete' })
    expect(getCalendarTaskDragActions()).toEqual({ left: 'pin', right: 'delete' })
  })

  it('设置项覆盖需求要求的全部动作且顺序稳定', () => {
    expect(CALENDAR_TASK_DRAG_ACTION_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'pin',
      'unpin',
      'delete',
      'complete',
      'uncomplete',
      'move-overdue-to-now',
      'clear-date',
    ])
  })

  it('损坏 JSON 回退默认值', () => {
    localStorage.setItem(STORAGE_KEYS.calendarTaskDragActions, '{not-json')
    expect(getCalendarTaskDragActions()).toEqual({ left: 'pin', right: 'delete' })
  })

  it('缺失字段按侧回退默认值', () => {
    expect(normalizeCalendarTaskDragActions({})).toEqual({ left: 'pin', right: 'delete' })
    expect(normalizeCalendarTaskDragActions({ left: 'complete' })).toEqual({
      left: 'complete',
      right: 'delete',
    })
    expect(normalizeCalendarTaskDragActions({ right: 'unpin' })).toEqual({
      left: 'pin',
      right: 'unpin',
    })
  })

  it('非法值与错误类型仅回退对应侧', () => {
    expect(normalizeCalendarTaskDragActions({ left: 'explode', right: 'complete' })).toEqual({
      left: 'pin',
      right: 'complete',
    })
    expect(normalizeCalendarTaskDragActions({ left: 42, right: null })).toEqual({
      left: 'pin',
      right: 'delete',
    })
    expect(normalizeCalendarTaskDragActions([])).toEqual({ left: 'pin', right: 'delete' })
    expect(normalizeCalendarTaskDragActions('oops')).toEqual({ left: 'pin', right: 'delete' })
  })

  it('自定义左右动作可持久化并重新读取', () => {
    saveCalendarTaskDragActions({ left: 'complete', right: 'move-overdue-to-now' })
    expect(getCalendarTaskDragActions()).toEqual({
      left: 'complete',
      right: 'move-overdue-to-now',
    })
  })

  it('保存时也会归一化非法值', () => {
    saveCalendarTaskDragActions({ left: 'nope' as never, right: 'uncomplete' })
    expect(getCalendarTaskDragActions()).toEqual({ left: 'pin', right: 'uncomplete' })
  })
})

describe('buildMoveOverdueTaskToNowUpdate', () => {
  const now = new Date(2026, 6, 10, 12, 0, 0)

  it('定时任务：开始时间移到当前时间并保留持续时长', () => {
    const task = makeTask({
      due_date: new Date(2026, 6, 9, 9, 0, 0).toISOString(),
      end_date: new Date(2026, 6, 9, 10, 30, 0).toISOString(),
      all_day: false,
    })
    const result = buildMoveOverdueTaskToNowUpdate(task, now)
    expect(result.applicable).toBe(true)
    expect(result.updates?.due_date).toBe(now.toISOString())
    expect(result.updates?.all_day).toBe(false)
    // 原时长 90 分钟
    expect(result.updates?.end_date).toBe(new Date(now.getTime() + 90 * 60 * 1000).toISOString())
  })

  it('全天任务：移动到今天并保留跨天跨度', () => {
    const task = makeTask({
      due_date: new Date(2026, 6, 8).toISOString(),
      end_date: new Date(2026, 6, 10).toISOString(),
      all_day: true,
    })
    const result = buildMoveOverdueTaskToNowUpdate(task, now)
    expect(result.applicable).toBe(true)
    expect(result.updates?.due_date).toBe(new Date(2026, 6, 10).toISOString())
    expect(result.updates?.all_day).toBe(true)
    expect(result.updates?.end_date).toBe(new Date(2026, 6, 12).toISOString())
  })

  it('全天任务结束时间不晚于开始时清空 end_date，避免残留旧日期', () => {
    const task = makeTask({
      due_date: new Date(2026, 6, 8).toISOString(),
      end_date: new Date(2026, 6, 8).toISOString(),
      all_day: true,
    })
    const result = buildMoveOverdueTaskToNowUpdate(task, now)
    expect(result.applicable).toBe(true)
    expect(result.updates?.end_date).toBeNull()
  })

  it('无日期任务：不适用且不产生更新', () => {
    const result = buildMoveOverdueTaskToNowUpdate(makeTask({ due_date: null }), now)
    expect(result.applicable).toBe(false)
    expect(result.updates).toBeUndefined()
    expect(result.reason).toContain('没有日期')
  })

  it('未过期任务：不适用且不产生更新', () => {
    const result = buildMoveOverdueTaskToNowUpdate(
      makeTask({ due_date: new Date(2026, 6, 11, 9, 0, 0).toISOString() }),
      now,
    )
    expect(result.applicable).toBe(false)
    expect(result.updates).toBeUndefined()
    expect(result.reason).toContain('尚未过期')
  })

  it('日期无效：不适用，避免写入 Invalid Date', () => {
    const result = buildMoveOverdueTaskToNowUpdate(makeTask({ due_date: 'not-a-date' }), now)
    expect(result.applicable).toBe(false)
    expect(result.updates).toBeUndefined()
  })

  it('定时任务无结束时间时只移动开始时间，不虚构结束时间', () => {
    const result = buildMoveOverdueTaskToNowUpdate(
      makeTask({ due_date: new Date(2026, 6, 9, 9, 0, 0).toISOString(), end_date: null }),
      now,
    )
    expect(result.applicable).toBe(true)
    expect(result.updates).toEqual({ due_date: now.toISOString(), all_day: false })
  })
})

describe('buildClearTaskDateUpdate', () => {
  it('同时清空 due_date、end_date 与全天标记', () => {
    expect(buildClearTaskDateUpdate()).toEqual({ due_date: null, end_date: null, all_day: false })
  })
})
