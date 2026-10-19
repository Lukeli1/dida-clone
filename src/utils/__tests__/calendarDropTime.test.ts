import { describe, expect, it } from 'vitest'
import {
  CALENDAR_DRAG_GRAB_OFFSET_MIME,
  computeDropISO,
  computeDropStartMinute,
  computeGrabOffsetY,
  readGrabOffsetY,
  writeGrabOffsetY,
} from '../calendarDropTime'

/**
 * 日历拖拽落点坐标换算的纯函数回归。
 *
 * 约定：拖动图像按「抓取偏移」跟随光标，落点开始时间 = 光标位置 − 抓取偏移，
 * 15 分钟吸附，钳制在当天 00:00 ~ 23:45。
 */
describe('computeGrabOffsetY', () => {
  it('返回指针相对块顶部的像素偏移', () => {
    expect(computeGrabOffsetY(582, 540, 60)).toBe(42)
  })

  it('指针在块上方时钳制为 0', () => {
    expect(computeGrabOffsetY(520, 540, 60)).toBe(0)
  })

  it('指针超出块底部时钳制为块高', () => {
    expect(computeGrabOffsetY(650, 540, 60)).toBe(60)
  })

  it('参数异常时回退 0（等价按住块顶部）', () => {
    expect(computeGrabOffsetY(Number.NaN, 540, 60)).toBe(0)
    expect(computeGrabOffsetY(582, Number.NaN, 60)).toBe(0)
    expect(computeGrabOffsetY(582, 540, 0)).toBe(0)
  })
})

describe('computeDropStartMinute', () => {
  it('无抓取偏移时等价旧行为：光标位置即开始时间', () => {
    expect(computeDropStartMinute({ pointerClientY: 840, columnTop: 0, hourHeight: 60 })).toBe(840)
  })

  it('扣除抓取偏移并吸附 15 分钟：42px 偏移落点前移 45 分钟', () => {
    // 光环调整：840 - 42 = 798 → 吸附到 795（13:15）
    expect(computeDropStartMinute({ pointerClientY: 840, columnTop: 0, grabOffsetY: 42, hourHeight: 60 })).toBe(795)
  })

  it('吸附边界：7 分钟向下取整到 0，8 分钟向上到 15', () => {
    expect(computeDropStartMinute({ pointerClientY: 7, columnTop: 0, hourHeight: 60 })).toBe(0)
    expect(computeDropStartMinute({ pointerClientY: 8, columnTop: 0, hourHeight: 60 })).toBe(15)
  })

  it('时间轴滚动后结果不变（columnTop 为负）', () => {
    const scrolled = computeDropStartMinute({ pointerClientY: 360, columnTop: -480, hourHeight: 60 })
    const unscrolled = computeDropStartMinute({ pointerClientY: 840, columnTop: 0, hourHeight: 60 })
    expect(scrolled).toBe(unscrolled)
    expect(scrolled).toBe(840)
  })

  it('抓取偏移导致越界时钳制到当天 00:00', () => {
    // 光标在 00:30，偏移 100 → 上一日前移被钳制到 0
    expect(computeDropStartMinute({ pointerClientY: 30, columnTop: 0, grabOffsetY: 100, hourHeight: 60 })).toBe(0)
  })

  it('日末钳制到 23:45', () => {
    expect(computeDropStartMinute({ pointerClientY: 24 * 60, columnTop: 0, hourHeight: 60 })).toBe(1425)
    expect(computeDropStartMinute({ pointerClientY: 24 * 60, columnTop: 0, grabOffsetY: 0, hourHeight: 60 })).toBe(1425)
  })

  it('支持非 60px 小时高度的时间轴', () => {
    // 72px/小时：光标 720px 处 = 10:00
    expect(computeDropStartMinute({ pointerClientY: 720, columnTop: 0, hourHeight: 72 })).toBe(600)
  })
})

describe('computeDropISO', () => {
  it('使用抓取偏移后的分钟数构建本地日期时间', () => {
    const iso = computeDropISO({
      dateKey: '2026-07-03',
      pointerClientY: 840,
      columnTop: 0,
      grabOffsetY: 42,
      hourHeight: 60,
    })
    const d = new Date(iso)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(3)
    expect(d.getHours()).toBe(13)
    expect(d.getMinutes()).toBe(15)
  })

  it('默认偏移 0 时与既有落点语义一致', () => {
    const iso = computeDropISO({ dateKey: '2026-07-03', pointerClientY: 840, columnTop: 0, hourHeight: 60 })
    const d = new Date(iso)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(0)
  })
})

describe('抓取偏移的 DataTransfer 读写', () => {
  function makeDataTransfer(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    return {
      store,
      getData: (type: string) => store.get(type) ?? '',
      setData: (type: string, value: string) => {
        store.set(type, value)
      },
    }
  }

  it('写入后按同一类型读回（四舍五入为整数）', () => {
    const dt = makeDataTransfer()
    writeGrabOffsetY(dt, 42.4)
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('42')
    expect(readGrabOffsetY(dt)).toBe(42)
  })

  it('负偏移写入 0，读取按 0 处理', () => {
    const dt = makeDataTransfer()
    writeGrabOffsetY(dt, -8)
    expect(dt.getData(CALENDAR_DRAG_GRAB_OFFSET_MIME)).toBe('0')
    expect(readGrabOffsetY(dt)).toBe(0)
  })

  it('未写入（任务侧边栏等来源）读取为 0', () => {
    const dt = makeDataTransfer({ 'text/plain': '3' })
    expect(readGrabOffsetY(dt)).toBe(0)
  })

  it('非法值与抛错时回退 0，不阻断拖拽主流程', () => {
    expect(readGrabOffsetY(makeDataTransfer({ [CALENDAR_DRAG_GRAB_OFFSET_MIME]: 'abc' }))).toBe(0)
    expect(
      readGrabOffsetY({
        getData: () => {
          throw new Error('blocked')
        },
        setData: () => {},
      }),
    ).toBe(0)
    expect(() => writeGrabOffsetY(null, 10)).not.toThrow()
    expect(readGrabOffsetY(null)).toBe(0)
  })
})
