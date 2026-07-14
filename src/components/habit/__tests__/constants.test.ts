import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHabitDayAction,
  getWeekDays,
  getWeekRangeLabel,
  getWeekStart,
  isCurrentWeek,
  isFutureDay,
} from '../constants'

const TODAY = new Date(2026, 6, 14, 10, 0, 0)

describe('习惯日期工具', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('以周一作为当前周起点，并从指定周一生成连续七天', () => {
    const weekStart = getWeekStart(TODAY)
    expect(weekStart).toEqual(new Date(2026, 6, 13))
    expect(getWeekDays(weekStart).map((date) => date.getDate())).toEqual([13, 14, 15, 16, 17, 18, 19])
  })

  it('为同月、跨月和跨年周提供无歧义日期范围', () => {
    expect(getWeekRangeLabel(new Date(2026, 6, 13), TODAY)).toBe('7月13日 - 7月19日')
    expect(getWeekRangeLabel(new Date(2026, 5, 29), TODAY)).toBe('6月29日 - 7月5日')
    expect(getWeekRangeLabel(new Date(2025, 11, 29), TODAY)).toBe('2025年12月29日 - 2026年1月4日')
  })

  it('只把当前自然周识别为当前周', () => {
    expect(isCurrentWeek(new Date(2026, 6, 13), TODAY)).toBe(true)
    expect(isCurrentWeek(new Date(2026, 6, 6), TODAY)).toBe(false)
  })

  it('今天和过去日期可操作，明天开始是未来日期', () => {
    expect(isFutureDay(new Date(2026, 6, 13), TODAY)).toBe(false)
    expect(isFutureDay(new Date(2026, 6, 14), TODAY)).toBe(false)
    expect(isFutureDay(new Date(2026, 6, 15), TODAY)).toBe(true)
  })

  it.each([
    [0, 3, { type: 'upsert', count: 3 }],
    [2, 3, { type: 'upsert', count: 3 }],
    [3, 3, { type: 'delete' }],
    [4, 3, { type: 'delete' }],
  ] as const)('将 count=%i、goal=%i 解析为正确的日打卡动作', (currentCount, goal, expected) => {
    expect(getHabitDayAction(currentCount, goal)).toEqual(expected)
  })
})
