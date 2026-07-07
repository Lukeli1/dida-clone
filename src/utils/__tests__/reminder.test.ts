import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getReminderTime, toDatetimeLocalValue, fromDatetimeLocalValue, formatReminderDisplay } from '../reminder'

/**
 * reminder 工具函数测试。
 *
 * 使用 vi.useFakeTimers + vi.setSystemTime 固定当前时间，
 * 确保 getReminderTime 的偏移计算和 formatReminderDisplay 的相对时间格式可预测。
 */

// 固定当前时间为 2026-06-30T14:30:00.000Z（UTC）
// 对应北京时间 2026-06-30 22:30（+08:00）
const FIXED_TIME = new Date('2026-06-30T14:30:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_TIME)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getReminderTime', () => {
  it('5 分钟偏移：返回的 ISO 时间比当前时间多 5 分钟', () => {
    const result = getReminderTime(5)
    const expected = new Date(FIXED_TIME.getTime() + 5 * 60 * 1000)
    expect(new Date(result).getTime()).toBe(expected.getTime())
  })

  it('15 分钟偏移：返回的 ISO 时间比当前时间多 15 分钟', () => {
    const result = getReminderTime(15)
    const expected = new Date(FIXED_TIME.getTime() + 15 * 60 * 1000)
    expect(new Date(result).getTime()).toBe(expected.getTime())
  })

  it('60 分钟（1 小时）偏移', () => {
    const result = getReminderTime(60)
    const expected = new Date(FIXED_TIME.getTime() + 60 * 60 * 1000)
    expect(new Date(result).getTime()).toBe(expected.getTime())
  })

  it('1440 分钟（1 天）偏移', () => {
    const result = getReminderTime(1440)
    const expected = new Date(FIXED_TIME.getTime() + 1440 * 60 * 1000)
    expect(new Date(result).getTime()).toBe(expected.getTime())
  })

  it('0 分钟偏移：返回当前时间', () => {
    const result = getReminderTime(0)
    expect(new Date(result).getTime()).toBe(FIXED_TIME.getTime())
  })

  it('返回的是有效的 ISO 字符串', () => {
    const result = getReminderTime(30)
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toString()).not.toBe('Invalid Date')
  })
})

describe('toDatetimeLocalValue', () => {
  it('将 ISO 字符串转换为 datetime-local 格式', () => {
    // FIXED_TIME = 2026-06-30T14:30:00.000Z
    // 在本地时区（假设 +08:00）显示为 2026-06-30T22:30
    const result = toDatetimeLocalValue('2026-06-30T14:30:00.000Z')
    // 验证格式为 yyyy-MM-ddTHH:mm
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('无效输入返回空字符串', () => {
    expect(toDatetimeLocalValue('invalid')).toBe('')
    expect(toDatetimeLocalValue('')).toBe('')
  })
})

describe('fromDatetimeLocalValue', () => {
  it('将 datetime-local 值转换为 ISO 字符串', () => {
    const result = fromDatetimeLocalValue('2026-07-01T09:00')
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toString()).not.toBe('Invalid Date')
  })

  it('round-trip：toDatetimeLocalValue -> fromDatetimeLocalValue 误差在 1 分钟内', () => {
    const original = '2026-06-30T14:30:00.000Z'
    const localValue = toDatetimeLocalValue(original)
    const roundTrip = fromDatetimeLocalValue(localValue)
    // 由于 datetime-local 精确到分钟，允许 1 分钟误差
    expect(Math.abs(new Date(roundTrip).getTime() - new Date(original).getTime())).toBeLessThan(60 * 1000)
  })
})

describe('formatReminderDisplay', () => {
  it('今天的提醒显示"今天 HH:MM"', () => {
    // 当前本地时间 = FIXED_TIME 在本地时区
    // 取当前本地时间的 1 小时后作为 reminder
    const now = new Date()
    const reminder = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    const result = formatReminderDisplay(reminder)
    // 至少包含"今天"
    expect(result).toContain('今天')
    // 包含时间格式 HH:MM
    expect(result).toMatch(/\d{2}:\d{2}/)
  })

  it('明天的提醒显示"明天 HH:MM"', () => {
    // 当前时间 + 1 天，设为上午 10 点避免跨日边界问题
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    const reminder = tomorrow.toISOString()
    const result = formatReminderDisplay(reminder)
    expect(result).toContain('明天')
  })

  it('3 天后的提醒显示"N天后 HH:MM"', () => {
    const now = new Date()
    const future = new Date(now)
    future.setDate(future.getDate() + 3)
    future.setHours(10, 0, 0, 0)
    const reminder = future.toISOString()
    const result = formatReminderDisplay(reminder)
    expect(result).toContain('3天后')
  })

  it('超过 7 天的提醒显示"MM月DD日 HH:MM"', () => {
    const now = new Date()
    const future = new Date(now)
    future.setDate(future.getDate() + 30)
    future.setHours(10, 0, 0, 0)
    const reminder = future.toISOString()
    const result = formatReminderDisplay(reminder)
    // 应包含"月"和"日"
    expect(result).toMatch(/\d{1,2}月\d{1,2}日/)
  })

  it('已过期的提醒显示"已过期 HH:MM"', () => {
    // 取过去的时间
    const past = new Date(FIXED_TIME.getTime() - 60 * 60 * 1000).toISOString()
    const result = formatReminderDisplay(past)
    expect(result).toContain('已过期')
  })

  it('无效输入返回空字符串', () => {
    expect(formatReminderDisplay('invalid')).toBe('')
    expect(formatReminderDisplay('')).toBe('')
  })
})
