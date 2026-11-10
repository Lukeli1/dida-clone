import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import { getTaskDueDateDisplay } from '../taskDateDisplay'

const NOW = new Date(2026, 10, 10, 12, 0, 0)

function localIso(year: number, month: number, day: number, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '日期摘要任务',
    notes: null,
    priority: 0,
    due_date: null,
    end_date: null,
    all_day: false,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 0,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

describe('getTaskDueDateDisplay 过期相对日期', () => {
  it('昨天显示「昨天」并包含月日与具体时间', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, 9, 17) }), NOW)
    expect(display).not.toBeNull()
    expect(display!.dateLabel).toBe('11月9日')
    expect(display!.relativeLabel).toBe('昨天')
    expect(display!.timeLabel).toBe('17:00')
    expect(display!.text).toBe('11月9日，昨天，17:00')
    expect(display!.ariaLabel).toBe('截止日期 11月9日，昨天，17:00')
    expect(display!.isOverdue).toBe(true)
    expect(display!.overdueDays).toBe(1)
  })

  it('逾期 2 天显示「延期2天」', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, 8, 17) }), NOW)
    expect(display!.relativeLabel).toBe('延期2天')
    expect(display!.text).toBe('11月8日，延期2天，17:00')
  })

  it('逾期多天显示正确天数', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, 3, 9, 30) }), NOW)
    expect(display!.overdueDays).toBe(7)
    expect(display!.relativeLabel).toBe('延期7天')
    expect(display!.text).toBe('11月3日，延期7天，09:30')
  })

  it('今天、明天与未来日期都不标记逾期', () => {
    for (const day of [10, 11, 12]) {
      const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, day, 8) }), NOW)
      expect(display!.isOverdue).toBe(false)
      expect(display!.relativeLabel).toBeNull()
      expect(display!.overdueDays).toBe(0)
    }
  })

  it('今天早些时候的时间点也不误判为逾期', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, 10, 8) }), NOW)
    expect(display!.isOverdue).toBe(false)
    expect(display!.relativeLabel).toBeNull()
    expect(display!.text).toBe('11月10日，08:00')
  })

  it('已完成任务保留日期与时间，但不显示逾期文案', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, 9, 17), completed: true }), NOW)
    expect(display!.isCompleted).toBe(true)
    expect(display!.isOverdue).toBe(false)
    expect(display!.relativeLabel).toBeNull()
    expect(display!.text).toBe('11月9日，17:00')
    expect(display!.ariaLabel).toBe('截止日期 11月9日，17:00')
  })

  it('全天任务不强行添加时间', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: localIso(2026, 11, 9), all_day: true }), NOW)
    expect(display!.timeLabel).toBeNull()
    expect(display!.relativeLabel).toBe('昨天')
    expect(display!.text).toBe('11月9日，昨天')
    expect(display!.ariaLabel).toBe('截止日期 11月9日，昨天')
  })

  it('全天跨日按可见结束日判断逾期并展示范围', () => {
    // 11/8 - 11/9（结束 11/10 00:00 排他）
    const display = getTaskDueDateDisplay(
      makeTask({
        due_date: localIso(2026, 11, 8),
        end_date: localIso(2026, 11, 10),
        all_day: true,
      }),
      NOW,
    )
    expect(display!.dateLabel).toBe('11月8日 - 11月9日')
    expect(display!.relativeLabel).toBe('昨天')
    expect(display!.text).toBe('11月8日 - 11月9日，昨天')
  })

  it('全天跨日结束于今天时不标记逾期', () => {
    const display = getTaskDueDateDisplay(
      makeTask({
        due_date: localIso(2026, 11, 9),
        end_date: localIso(2026, 11, 11),
        all_day: true,
      }),
      NOW,
    )
    expect(display!.dateLabel).toBe('11月9日 - 11月10日')
    expect(display!.isOverdue).toBe(false)
  })

  it('定时任务有结束时间时展示起止时间', () => {
    const display = getTaskDueDateDisplay(
      makeTask({ due_date: localIso(2026, 11, 9, 17), end_date: localIso(2026, 11, 9, 18, 30) }),
      NOW,
    )
    expect(display!.timeRangeLabel).toBe('17:00 - 18:30')
    expect(display!.text).toBe('11月9日，昨天，17:00 - 18:30')
    expect(display!.ariaLabel).toBe('截止日期 11月9日，昨天，17:00 - 18:30')
  })

  it('跨日定时任务展示结束日期与时间', () => {
    const display = getTaskDueDateDisplay(
      makeTask({ due_date: localIso(2026, 11, 8, 23), end_date: localIso(2026, 11, 9, 1) }),
      NOW,
    )
    expect(display!.timeRangeLabel).toBe('23:00 - 11月9日 01:00')
  })

  it('纯日期字符串按本地自然日解析，不受 UTC 日期偏移影响', () => {
    const display = getTaskDueDateDisplay(makeTask({ due_date: '2026-11-09' }), new Date(2026, 10, 10, 0, 30))
    expect(display!.dateLabel).toBe('11月9日')
    expect(display!.relativeLabel).toBe('昨天')
  })

  it('无截止日期或非法日期返回 null', () => {
    expect(getTaskDueDateDisplay(makeTask({ due_date: null }), NOW)).toBeNull()
    expect(getTaskDueDateDisplay(makeTask({ due_date: 'not-a-date' }), NOW)).toBeNull()
  })
})
