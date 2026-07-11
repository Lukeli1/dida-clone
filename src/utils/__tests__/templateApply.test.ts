import { describe, expect, it } from 'vitest'
import { toLocalDueDateIso } from '../templateApply'

describe('toLocalDueDateIso', () => {
  it('空值与非法格式返回 null', () => {
    expect(toLocalDueDateIso('')).toBeNull()
    expect(toLocalDueDateIso('   ')).toBeNull()
    expect(toLocalDueDateIso('2026/07/15')).toBeNull()
    expect(toLocalDueDateIso('not-a-date')).toBeNull()
    expect(toLocalDueDateIso('2026-02-31')).toBeNull()
  })

  it('使用本地日期分量构造，避免 UTC 解析导致前一天', () => {
    const iso = toLocalDueDateIso('2026-07-15')
    expect(iso).not.toBeNull()

    const local = new Date(iso!)
    // 关键：本地日历日必须仍是 2026-07-15（在任意时区机器上）
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(6) // 0-based
    expect(local.getDate()).toBe(15)
    expect(local.getHours()).toBe(23)
    expect(local.getMinutes()).toBe(59)
  })

  it('与 UTC 零点解析行为不同：本地 23:59 不会变成前一天日历日', () => {
    // 对照：UTC 解析 YYYY-MM-DD 在负时区会落到前一天本地日
    const utcParsed = new Date('2026-07-15')
    const fixed = new Date(toLocalDueDateIso('2026-07-15')!)

    // 本地日历日必须是 15 号
    expect(fixed.getDate()).toBe(15)

    // 若当前环境为 UTC 负偏移，UTC 解析会落到 14 号；我们的实现仍应保持 15 号
    const offsetMinutes = new Date().getTimezoneOffset()
    if (offsetMinutes > 0) {
      // getTimezoneOffset > 0 表示本地在 UTC 西侧（如 UTC-）
      expect(utcParsed.getDate()).toBe(14)
      expect(fixed.getDate()).toBe(15)
    }
  })
})
