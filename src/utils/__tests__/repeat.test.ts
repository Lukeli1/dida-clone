import { describe, it, expect } from 'vitest'
import {
  parseRepeatRule,
  serializeRepeatRule,
  getNextOccurrence,
  getRepeatSummary,
} from '../../types/repeat'

// 2026-06-15 是周一（getDay()=1），用于 WEEKLY 测试基准
const MONDAY = new Date('2026-06-15T10:00:00')

describe('parseRepeatRule', () => {
  it('null / undefined / 空字符串 返回 null', () => {
    expect(parseRepeatRule(null)).toBeNull()
    expect(parseRepeatRule(undefined)).toBeNull()
    expect(parseRepeatRule('')).toBeNull()
    expect(parseRepeatRule('   ')).toBeNull()
  })

  it('解析每天规则（缺省 INTERVAL 默认为 1）', () => {
    const rule = parseRepeatRule('FREQ=DAILY')
    expect(rule).toEqual({ freq: 'DAILY', interval: 1 })
  })

  it('解析每周指定星期（0=周日..6=周六）', () => {
    const rule = parseRepeatRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=1,3,5')
    expect(rule).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      byweekday: [1, 3, 5],
    })
  })

  it('解析每月规则', () => {
    const rule = parseRepeatRule('FREQ=MONTHLY;INTERVAL=1')
    expect(rule).toEqual({ freq: 'MONTHLY', interval: 1 })
  })

  it('解析每年规则', () => {
    const rule = parseRepeatRule('FREQ=YEARLY;INTERVAL=1')
    expect(rule).toEqual({ freq: 'YEARLY', interval: 1 })
  })

  it('解析带 COUNT 的规则', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=1;COUNT=5')
    expect(rule?.count).toBe(5)
  })

  it('解析带 UNTIL 的规则', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=1;UNTIL=2026-12-31')
    expect(rule?.endDate).toBe('2026-12-31')
  })

  it('无效 FREQ 返回 null', () => {
    expect(parseRepeatRule('FREQ=INVALID;INTERVAL=1')).toBeNull()
    expect(parseRepeatRule('INTERVAL=1')).toBeNull()
  })

  it('无效 INTERVAL 返回 null', () => {
    expect(parseRepeatRule('FREQ=DAILY;INTERVAL=0')).toBeNull()
    expect(parseRepeatRule('FREQ=DAILY;INTERVAL=abc')).toBeNull()
  })
})

describe('serializeRepeatRule', () => {
  it('序列化每天规则', () => {
    expect(serializeRepeatRule({ freq: 'DAILY', interval: 1 })).toBe('FREQ=DAILY;INTERVAL=1')
  })

  it('序列化每周指定星期', () => {
    expect(serializeRepeatRule({ freq: 'WEEKLY', interval: 2, byweekday: [1, 3, 5] })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=1,3,5',
    )
  })

  it('序列化带 endDate', () => {
    expect(serializeRepeatRule({ freq: 'DAILY', interval: 1, endDate: '2026-12-31' })).toBe(
      'FREQ=DAILY;INTERVAL=1;UNTIL=2026-12-31',
    )
  })

  it('序列化带 count', () => {
    expect(serializeRepeatRule({ freq: 'DAILY', interval: 1, count: 5 })).toBe(
      'FREQ=DAILY;INTERVAL=1;COUNT=5',
    )
  })

  it('round-trip：解析再序列化保持一致', () => {
    const str = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=0,2,4;COUNT=10'
    const rule = parseRepeatRule(str)
    expect(rule).not.toBeNull()
    expect(serializeRepeatRule(rule!)).toBe(str)
  })
})

describe('getNextOccurrence', () => {
  it('每天：周一 → 周二', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=1')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(16)
    expect(next!.getMonth()).toBe(5) // 6月（0-indexed）
  })

  it('每周指定星期（一三五）：周一 → 周三', () => {
    const rule = parseRepeatRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=1,3,5')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(17) // 周三
    expect(next!.getDay()).toBe(3)
  })

  it('每周指定星期（一三五）：周五 → 下周一', () => {
    const friday = new Date('2026-06-19T10:00:00') // 周五
    const rule = parseRepeatRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=1,3,5')!
    const next = getNextOccurrence(rule, friday)
    expect(next).not.toBeNull()
    expect(next!.getDay()).toBe(1) // 下周一
    expect(next!.getDate()).toBe(22)
  })

  it('每月：6月15日 → 7月15日', () => {
    const rule = parseRepeatRule('FREQ=MONTHLY;INTERVAL=1')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getMonth()).toBe(6) // 7月
    expect(next!.getDate()).toBe(15)
  })

  it('每月溢出：1月31日 → 2月28日', () => {
    const jan31 = new Date('2026-01-31T10:00:00')
    const rule = parseRepeatRule('FREQ=MONTHLY;INTERVAL=1')!
    const next = getNextOccurrence(rule, jan31)
    expect(next).not.toBeNull()
    expect(next!.getMonth()).toBe(1) // 2月
    expect(next!.getDate()).toBe(28) // 2026年2月只有28天
  })

  it('每年：2026-06-15 → 2027-06-15', () => {
    const rule = parseRepeatRule('FREQ=YEARLY;INTERVAL=1')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getFullYear()).toBe(2027)
    expect(next!.getMonth()).toBe(5)
    expect(next!.getDate()).toBe(15)
  })

  it('interval=2 的每周（无指定星期）：周一 → 两周后周一', () => {
    const rule = parseRepeatRule('FREQ=WEEKLY;INTERVAL=2')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(29) // 6月29日
    expect(next!.getDay()).toBe(1) // 仍为周一
  })

  it('interval=2 的每天：6月15日 → 6月17日', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=2')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(17)
  })

  it('endDate 到期：next 超过 endDate 返回 null', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=1;UNTIL=2026-06-15T23:59:59')!
    const next = getNextOccurrence(rule, MONDAY)
    // next = 6月16日 > endDate(6月15日23:59) → null
    expect(next).toBeNull()
  })

  it('endDate 未到期：next 在 endDate 之前返回有效日期', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=1;UNTIL=2026-06-20T00:00:00')!
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(16)
  })

  it('count 到期：count=0 返回 null', () => {
    const rule = parseRepeatRule('FREQ=DAILY;INTERVAL=1;COUNT=0')
    // count=0 → 已耗尽
    expect(getNextOccurrence(rule!, MONDAY)).toBeNull()
  })

  it('count>0 时正常返回下一个出现', () => {
    const rule = { freq: 'DAILY' as const, interval: 1, count: 5 }
    const next = getNextOccurrence(rule, MONDAY)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(16)
  })

  it('WEEKLY interval=2 指定星期：跳过间隔周', () => {
    // 周一三五，每2周。从周五(6月19日)开始，下一周(week1)是off week，再下一周(week2)才有
    const friday = new Date('2026-06-19T10:00:00')
    const rule = parseRepeatRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=1,3,5')!
    const next = getNextOccurrence(rule, friday)
    expect(next).not.toBeNull()
    // week0: 6/15-6/21, week2: 6/29-7/5。从周五6/19开始，下个匹配是周一6/29
    expect(next!.getDay()).toBe(1)
    expect(next!.getDate()).toBe(29)
  })
})

describe('getRepeatSummary', () => {
  it('null 返回空字符串', () => {
    expect(getRepeatSummary(null)).toBe('')
  })

  it('每天', () => {
    expect(getRepeatSummary({ freq: 'DAILY', interval: 1 })).toBe('每天')
  })

  it('每2天', () => {
    expect(getRepeatSummary({ freq: 'DAILY', interval: 2 })).toBe('每2天')
  })

  it('每周（无指定星期）', () => {
    expect(getRepeatSummary({ freq: 'WEEKLY', interval: 1 })).toBe('每周')
  })

  it('每周一、三、五', () => {
    expect(getRepeatSummary({ freq: 'WEEKLY', interval: 1, byweekday: [1, 3, 5] })).toBe(
      '每周一、三、五',
    )
  })

  it('每周日、六', () => {
    expect(getRepeatSummary({ freq: 'WEEKLY', interval: 1, byweekday: [0, 6] })).toBe(
      '每周日、六',
    )
  })

  it('每2周', () => {
    expect(getRepeatSummary({ freq: 'WEEKLY', interval: 2 })).toBe('每2周')
  })

  it('每2周的周一、三、五', () => {
    expect(getRepeatSummary({ freq: 'WEEKLY', interval: 2, byweekday: [1, 3, 5] })).toBe(
      '每2周的周一、三、五',
    )
  })

  it('每月', () => {
    expect(getRepeatSummary({ freq: 'MONTHLY', interval: 1 })).toBe('每月')
  })

  it('每3个月', () => {
    expect(getRepeatSummary({ freq: 'MONTHLY', interval: 3 })).toBe('每3个月')
  })

  it('每年', () => {
    expect(getRepeatSummary({ freq: 'YEARLY', interval: 1 })).toBe('每年')
  })

  it('每5年', () => {
    expect(getRepeatSummary({ freq: 'YEARLY', interval: 5 })).toBe('每5年')
  })

  it('从 repeat_rule 字符串解析后获取摘要', () => {
    const rule = parseRepeatRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=1,3,5')
    expect(getRepeatSummary(rule)).toBe('每周一、三、五')
  })
})
