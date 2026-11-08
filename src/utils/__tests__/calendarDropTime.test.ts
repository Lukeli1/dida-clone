import { describe, expect, it } from 'vitest'
import {
  CALENDAR_DRAG_DAY_OFFSET_MIME,
  CALENDAR_DRAG_DISPLAY_OFFSET_MIME,
  CALENDAR_DRAG_GRAB_OFFSET_MIME,
  computeDropISO,
  computeDropStartMinute,
  computeGrabOffsetY,
  localDayDiff,
  readDisplayOffsetMinutes,
  readDragDayOffset,
  readGrabOffsetY,
  shiftLocalDateKeyByDays,
  writeDisplayOffsetMinutes,
  writeDragDayOffset,
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

/**
 * 跨日分段整体拖动：抓取日相对真实开始日的本地自然日偏移。
 * offset 仅由「分段所在自然日 − 真实开始自然日」决定，drop 时用目标日减去 offset
 * 还原整个任务的新起点，保证从 start / middle / end 段拖动都是同一整体平移。
 */
describe('本地自然日偏移', () => {
  it('按本地年月日计算天数差，不受时段影响', () => {
    expect(localDayDiff(new Date(2026, 6, 1, 9, 0), new Date(2026, 6, 2, 8, 0))).toBe(1)
    expect(localDayDiff(new Date(2026, 6, 1, 23, 0), new Date(2026, 6, 2, 0, 30))).toBe(1)
    expect(localDayDiff(new Date(2026, 6, 2, 9, 0), new Date(2026, 6, 1, 9, 0))).toBe(-1)
    expect(localDayDiff(new Date(2026, 6, 1, 9, 0), new Date(2026, 6, 1, 21, 0))).toBe(0)
  })

  it('跨月 / 跨年 / 跨周按自然日推进（分量运算，不用固定 24 小时毫秒）', () => {
    const shifted = shiftLocalDateKeyByDays('2026-07-01', 2)
    expect([shifted.getFullYear(), shifted.getMonth(), shifted.getDate()]).toEqual([2026, 5, 29]) // 6 月 29 日
    const yearEnd = shiftLocalDateKeyByDays('2027-01-01', 3)
    expect([yearEnd.getFullYear(), yearEnd.getMonth(), yearEnd.getDate()]).toEqual([2026, 11, 29]) // 12 月 29 日
    const crossMonth = shiftLocalDateKeyByDays('2026-03-01', 1)
    expect([crossMonth.getMonth(), crossMonth.getDate()]).toEqual([1, 28]) // 2 月 28 日
  })

  it('写入 / 读取日偏移；缺省、非法、抛错均回退 0', () => {
    const dt = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => dt.set(type, value),
      getData: (type: string) => dt.get(type) ?? '',
    }
    writeDragDayOffset(dataTransfer, 2)
    expect(dt.get(CALENDAR_DRAG_DAY_OFFSET_MIME)).toBe('2')
    expect(readDragDayOffset(dataTransfer)).toBe(2)

    writeDragDayOffset(dataTransfer, -1)
    expect(readDragDayOffset(dataTransfer)).toBe(0)
    expect(readDragDayOffset({ getData: () => 'abc', setData: () => {} })).toBe(0)
    expect(
      readDragDayOffset({
        getData: () => {
          throw new Error('blocked')
        },
        setData: () => {},
      }),
    ).toBe(0)
    expect(readDragDayOffset(null)).toBe(0)
    expect(() => writeDragDayOffset(null, 1)).not.toThrow()
  })
})

/**
 * 子轨道显示偏移：块顶 = 真实开始 + 显示偏移。
 * drop 时先减偏移再吸附，保证抓取并放回原坐标不改变原时间。
 */
describe('子轨道显示偏移', () => {
  it('写入 / 读取显示偏移；缺省、非法、抛错均回退 0', () => {
    const store = new Map<string, string>()
    const dt = {
      setData: (type: string, value: string) => store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
    }
    writeDisplayOffsetMinutes(dt, 20)
    expect(store.get(CALENDAR_DRAG_DISPLAY_OFFSET_MIME)).toBe('20')
    expect(readDisplayOffsetMinutes(dt)).toBe(20)
    // 允许负偏移：显示位置可早于原始位置（交集起点位移为负时）
    writeDisplayOffsetMinutes(dt, -5)
    expect(readDisplayOffsetMinutes(dt)).toBe(-5)
    expect(readDisplayOffsetMinutes({ getData: () => 'abc', setData: () => {} })).toBe(0)
    expect(readDisplayOffsetMinutes(null)).toBe(0)
  })

  it('放回原位：块顶分钟减去显示偏移后吸附，不产生 15 分钟漂移', () => {
    // 任务真实 09:00，第三子轨道显示下移 40 分钟（块顶 09:40 = 580px）
    const startMinute = computeDropStartMinute({
      pointerClientY: 590,
      columnTop: 0,
      grabOffsetY: 10,
      displayOffsetMinutes: 40,
      hourHeight: 60,
    })
    expect(startMinute).toBe(540)
  })

  it('仅横向移动日期时保持原时分（纵向坐标不变）', () => {
    const startMinute = computeDropStartMinute({
      pointerClientY: 590,
      columnTop: 0,
      grabOffsetY: 10,
      displayOffsetMinutes: 40,
      hourHeight: 60,
    })
    expect(startMinute).toBe(540)
  })

  it('负显示偏移（显示早于原始位置）同样正确归位', () => {
    // 原始 09:30，显示位置 09:20（比真实开始早 10 分钟）
    const startMinute = computeDropStartMinute({
      pointerClientY: 560,
      columnTop: 0,
      grabOffsetY: 0,
      displayOffsetMinutes: -10,
      hourHeight: 60,
    })
    expect(startMinute).toBe(570)
  })

  it('无显示偏移时保持原有落点语义（不受影响）', () => {
    expect(computeDropStartMinute({ pointerClientY: 840, columnTop: 0, grabOffsetY: 42, hourHeight: 60 })).toBe(795)
  })
})
