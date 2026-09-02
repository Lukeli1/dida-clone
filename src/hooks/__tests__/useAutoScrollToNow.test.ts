import { describe, expect, it } from 'vitest'
import { computeTimeAxisScrollTop } from '../useAutoScrollToNow'

describe('computeTimeAxisScrollTop 时间轴定位计算', () => {
  const base = { scrollHeight: 1600, clientHeight: 600, allDayAreaHeight: 32 }

  it('白天时段把当前时间定位到视口约上三分之一处', () => {
    // 15:00 → 内容顶部 48(日期头)+32(全天区)+900(分钟像素) - 600/3
    const top = computeTimeAxisScrollTop({ ...base, minutes: 15 * 60 })
    expect(top).toBe(48 + 32 + 900 - 200)
  })

  it('凌晨时段目标为负时钳制到 0，不产生无效滚动', () => {
    expect(computeTimeAxisScrollTop({ ...base, minutes: 30 })).toBe(0)
    expect(computeTimeAxisScrollTop({ ...base, minutes: 0 })).toBe(0)
  })

  it('深夜时段超出最大可滚动范围时钳制到底部', () => {
    const maxScroll = base.scrollHeight - base.clientHeight
    expect(computeTimeAxisScrollTop({ ...base, minutes: 23 * 60 + 59 })).toBe(maxScroll)
  })

  it('内容不足以滚动（容器未完成布局或内容过短）时返回 0', () => {
    expect(computeTimeAxisScrollTop({ scrollHeight: 0, clientHeight: 0, minutes: 720, allDayAreaHeight: 32 })).toBe(0)
    expect(computeTimeAxisScrollTop({ scrollHeight: 400, clientHeight: 600, minutes: 720, allDayAreaHeight: 32 })).toBe(
      0,
    )
  })

  it('非法分钟数（越界）被钳制在 00:00~24:00 之间', () => {
    const lateNight = computeTimeAxisScrollTop({ ...base, minutes: 5000 })
    expect(lateNight).toBe(base.scrollHeight - base.clientHeight)
    expect(computeTimeAxisScrollTop({ ...base, minutes: -50 })).toBe(0)
  })
})
