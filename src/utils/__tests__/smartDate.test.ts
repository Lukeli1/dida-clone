import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseSmartDate } from '../smartDate'

// 固定“当前时间”为 2026-06-15 10:00（周一）。
// June 在 Date 构造器中是月份索引 5；该日期经推算确为周一（getDay() === 1）。
const FIXED_NOW = new Date(2026, 5, 15, 10, 0, 0)

/** 将 ISO 字符串转回本地日期组件，便于跨时区断言 */
function components(iso: string) {
  const d = new Date(iso)
  return {
    year: d.getFullYear(),
    month: d.getMonth(), // 0-based
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  }
}

describe('parseSmartDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('基础行为', () => {
    it('纯文本不含任何关键词时，返回原标题且无日期/优先级/重复', () => {
      const result = parseSmartDate('买牛奶')
      expect(result.cleanedTitle).toBe('买牛奶')
      expect(result.dueDate).toBeUndefined()
      expect(result.priority).toBeUndefined()
      expect(result.repeatRule).toBeUndefined()
    })

    it('文本为空时，保留原文且不解析出日期', () => {
      const result = parseSmartDate('')
      expect(result.cleanedTitle).toBe('')
      expect(result.dueDate).toBeUndefined()
    })
  })

  describe('日期解析', () => {
    it('“今天”解析为当天，默认时间 09:00', () => {
      const result = parseSmartDate('今天买牛奶')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 15, hour: 9, minute: 0 })
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“明天”解析为次日 09:00', () => {
      const result = parseSmartDate('明天买牛奶')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 16, hour: 9, minute: 0 })
    })

    it('“后天”解析为 +2 天 09:00', () => {
      const result = parseSmartDate('后天开会')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 17, hour: 9, minute: 0 })
      expect(result.cleanedTitle).toBe('开会')
    })

    it('“大后天”：源码中 /后天/ 先于 /大后天/ 命中，故实际按 +2 天处理', () => {
      // 注意：parseDate 先检测 /后天/，而“大后天”包含“后天”子串，
      // 因此“大后天”会被 /后天/ 分支命中，实际行为为 +2 天（以实际代码为准）。
      const result = parseSmartDate('大后天出差')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 17, hour: 9, minute: 0 })
    })

    it('“本周末”解析为本周六（2026-06-20）09:00', () => {
      const result = parseSmartDate('本周末打球')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 20, hour: 9, minute: 0 })
      expect(result.cleanedTitle).toBe('打球')
    })

    it('“下周一”解析为下周一（2026-06-22）09:00', () => {
      const result = parseSmartDate('下周一开会')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 22, hour: 9, minute: 0 })
    })

    it('“周三”解析为本周三（2026-06-17）09:00', () => {
      const result = parseSmartDate('周三开会')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 17, hour: 9, minute: 0 })
      expect(result.cleanedTitle).toBe('开会')
    })

    it('“1月1日”在当年已过期时，自动顺延到次年（2027-01-01）', () => {
      const result = parseSmartDate('1月1日买礼物')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2027, month: 0, day: 1, hour: 9, minute: 0 })
    })
  })

  describe('时间解析', () => {
    it('“下午3点”解析为 15:00', () => {
      const result = parseSmartDate('今天下午3点开会')
      const c = components(result.dueDate!)
      expect(c.hour).toBe(15)
      expect(c.minute).toBe(0)
      expect(c.day).toBe(15)
      expect(result.cleanedTitle).toBe('开会')
    })

    it('“上午9点”解析为 09:00', () => {
      const result = parseSmartDate('明天上午9点开会')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 16, hour: 9, minute: 0 })
    })

    it('“晚上8点”解析为 20:00', () => {
      const result = parseSmartDate('今天晚上8点开会')
      const c = components(result.dueDate!)
      expect(c.hour).toBe(20)
      expect(c.minute).toBe(0)
    })

    it('“3点半”解析为 03:30', () => {
      const result = parseSmartDate('今天3点半开会')
      const c = components(result.dueDate!)
      expect(c.hour).toBe(3)
      expect(c.minute).toBe(30)
    })

    it('“14点30分”解析为 14:30', () => {
      const result = parseSmartDate('今天14点30分开会')
      const c = components(result.dueDate!)
      expect(c.hour).toBe(14)
      expect(c.minute).toBe(30)
    })

    it('日期 + 时间组合：明天买牛奶下午3点 → 次日 15:00', () => {
      const result = parseSmartDate('明天买牛奶下午3点')
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 16, hour: 15, minute: 0 })
      expect(result.cleanedTitle).toBe('买牛奶')
    })
  })

  describe('优先级解析', () => {
    it('“高优先级”解析为 priority=1 并从标题中移除', () => {
      const result = parseSmartDate('高优先级买牛奶')
      expect(result.priority).toBe(1)
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“重要”关键词解析为 priority=1', () => {
      const result = parseSmartDate('买牛奶重要')
      expect(result.priority).toBe(1)
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“中优先级”解析为 priority=2', () => {
      const result = parseSmartDate('中优先级买牛奶')
      expect(result.priority).toBe(2)
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“低优先级”解析为 priority=3', () => {
      const result = parseSmartDate('低优先级买牛奶')
      expect(result.priority).toBe(3)
      expect(result.cleanedTitle).toBe('买牛奶')
    })
  })

  describe('重复规则解析', () => {
    it('“每天”解析为 repeatRule=daily', () => {
      const result = parseSmartDate('每天买牛奶')
      expect(result.repeatRule).toBe('daily')
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“工作日”解析为 repeatRule=weekdays', () => {
      const result = parseSmartDate('工作日买牛奶')
      expect(result.repeatRule).toBe('weekdays')
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“每周”解析为 repeatRule=weekly', () => {
      const result = parseSmartDate('每周买牛奶')
      expect(result.repeatRule).toBe('weekly')
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“每月15号”解析为包含 day 的 monthly JSON', () => {
      const result = parseSmartDate('每月15号买牛奶')
      expect(result.repeatRule).toBeDefined()
      const parsed = JSON.parse(result.repeatRule!)
      expect(parsed).toEqual({ type: 'monthly', day: 15 })
      expect(result.cleanedTitle).toBe('买牛奶')
    })

    it('“每年”解析为 yearly JSON', () => {
      const result = parseSmartDate('每年买牛奶')
      const parsed = JSON.parse(result.repeatRule!)
      expect(parsed).toEqual({ type: 'yearly' })
    })
  })

  describe('组合场景', () => {
    it('优先级 + 日期 + 时间可同时解析', () => {
      const result = parseSmartDate('高优先级明天下午3点开会')
      expect(result.priority).toBe(1)
      const c = components(result.dueDate!)
      expect(c).toEqual({ year: 2026, month: 5, day: 16, hour: 15, minute: 0 })
      expect(result.cleanedTitle).toBe('开会')
    })

    it('当清理后标题为空时，回退为原始输入', () => {
      const result = parseSmartDate('明天')
      expect(result.dueDate).toBeDefined()
      // “明天”被清理后为空，回退为原文
      expect(result.cleanedTitle).toBe('明天')
    })
  })
})
