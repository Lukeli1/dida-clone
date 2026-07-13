import { describe, expect, it } from 'vitest'
import {
  buildLocalDateTime,
  canonicalizeDateAndMinute,
  formatCalendarRangeDuration,
  getCalendarRangeDurationMinutes,
  getPointerDayAndMinute,
  normalizeCalendarRange,
  normalizeDateKeyRange,
  snapCalendarMinute,
  splitCalendarRangeIntoDaySegments,
  type CalendarRangePoint,
} from '../calendarRangeSelection'

const days = ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']

function point(dayIndex: number, minute: number): CalendarRangePoint {
  return { dateKey: days[dayIndex], dayIndex, minute }
}

describe('calendarRangeSelection', () => {
  it('月视图日期范围支持正向和反向归一化', () => {
    expect(normalizeDateKeyRange(1, 4, days)).toEqual({
      startDateKey: days[1],
      endDateKey: days[4],
      startIndex: 1,
      endIndex: 4,
    })
    expect(normalizeDateKeyRange(4, 1, days)).toEqual({
      startDateKey: days[1],
      endDateKey: days[4],
      startIndex: 1,
      endIndex: 4,
    })
  })
  it('同日正向选择保持起止分钟', () => {
    expect(normalizeCalendarRange(point(0, 540), point(0, 630))).toMatchObject({
      startDateKey: days[0],
      startMinute: 540,
      endDateKey: days[0],
      endMinute: 630,
    })
  })

  it('同日反向选择自动归一化', () => {
    expect(normalizeCalendarRange(point(0, 630), point(0, 540))).toMatchObject({
      startMinute: 540,
      endMinute: 630,
    })
  })

  it('跨日与反向跨日均按日期时间归一化', () => {
    const forward = normalizeCalendarRange(point(0, 540), point(2, 1050))
    const reverse = normalizeCalendarRange(point(2, 1050), point(0, 540))
    expect(reverse).toEqual(forward)
    expect(forward).toMatchObject({
      startDateKey: '2026-06-29',
      startMinute: 540,
      endDateKey: '2026-07-01',
      endMinute: 1050,
    })
  })

  it('三日范围拆分为起始、中间、结束三个预览片段', () => {
    const range = normalizeCalendarRange(point(0, 540), point(2, 1050))
    expect(splitCalendarRangeIntoDaySegments(range, days)).toEqual([
      { dateKey: days[0], dayIndex: 0, startMinute: 540, endMinute: 1440, isStart: true, isEnd: false },
      { dateKey: days[1], dayIndex: 1, startMinute: 0, endMinute: 1440, isStart: false, isEnd: false },
      { dateKey: days[2], dayIndex: 2, startMinute: 0, endMinute: 1050, isStart: false, isEnd: true },
    ])
  })

  it('同日范围只生成一个同时为开始和结束的片段', () => {
    const range = normalizeCalendarRange(point(1, 600), point(1, 720))
    expect(splitCalendarRangeIntoDaySegments(range, days)).toEqual([
      { dateKey: days[1], dayIndex: 1, startMinute: 600, endMinute: 720, isStart: true, isEnd: true },
    ])
  })

  it('分钟按 15 分钟吸附并裁剪到 00:00-24:00', () => {
    expect(snapCalendarMinute(543)).toBe(540)
    expect(snapCalendarMinute(548)).toBe(555)
    expect(snapCalendarMinute(-30)).toBe(0)
    expect(snapCalendarMinute(1500)).toBe(1440)
  })

  it('根据网格 X/Y 坐标准确计算日期列和分钟', () => {
    expect(getPointerDayAndMinute(250, 540, { left: 0, top: 0, width: 700 }, days, 60)).toEqual({
      dateKey: days[2],
      dayIndex: 2,
      minute: 540,
    })
  })

  it('越界坐标安全裁剪到首末日期和时间边界', () => {
    expect(getPointerDayAndMinute(-100, -100, { left: 0, top: 0, width: 700 }, days, 60)).toEqual({
      dateKey: days[0],
      dayIndex: 0,
      minute: 0,
    })
    expect(getPointerDayAndMinute(900, 2000, { left: 0, top: 0, width: 700 }, days, 60)).toEqual({
      dateKey: days[6],
      dayIndex: 6,
      minute: 1440,
    })
  })

  it('24:00 规范化为次日 00:00', () => {
    expect(canonicalizeDateAndMinute('2026-06-29', 1440)).toEqual({ dateKey: '2026-06-30', minute: 0 })
  })

  it('本地日期构造保留本地年月日和分钟', () => {
    const date = buildLocalDateTime('2026-07-01', 9 * 60 + 30)
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]).toEqual([
      2026, 7, 1, 9, 30,
    ])
  })

  it('持续时间使用真实 Date 差值而不是按日期数量硬编码', () => {
    const expected = Math.round(
      (buildLocalDateTime('2026-07-02', 9 * 60).getTime() - buildLocalDateTime('2026-06-29', 9 * 60).getTime()) / 60000,
    )
    expect(getCalendarRangeDurationMinutes('2026-06-29', 540, '2026-07-02', 540)).toBe(expected)
  })

  it('持续时长格式对天、小时、分钟可读', () => {
    expect(formatCalendarRangeDuration(2 * 1440 + 8 * 60 + 30)).toBe('2 天 8 小时 30 分钟')
  })
})
