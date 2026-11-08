import { describe, expect, it } from 'vitest'
import type { Task } from '../../types'
import {
  computeLanePosition,
  getCrossDayTimedWindow,
  layoutTimedTasks,
  layoutWeekTimedConflicts,
} from '../calendarTaskLayout'

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = '2026-01-01T00:00:00'
  return {
    id: 1,
    title: '测试任务',
    notes: '',
    priority: 2,
    due_date: undefined,
    end_date: undefined,
    reminder: undefined,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: undefined,
    repeat_rule: undefined,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

describe('layoutTimedTasks', () => {
  it('将完全重叠的任务分到不同列', () => {
    const first = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })
    const second = makeTask({ id: 2, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })

    const layouts = layoutTimedTasks([first, second])

    expect(layouts[0]).toMatchObject({ task: first, top: 540, height: 60, leftPercent: 0 })
    expect(layouts[0].widthPercent).toBeCloseTo(49.25)
    expect(layouts[1]).toMatchObject({ task: second, top: 540, height: 60 })
    expect(layouts[1].leftPercent).toBeCloseTo(50.75)
    expect(layouts[1].widthPercent).toBeCloseTo(49.25)
  })

  it('将部分重叠的任务作为同一冲突组贪心分列', () => {
    const first = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })
    const second = makeTask({ id: 2, due_date: '2026-01-01T09:30:00', end_date: '2026-01-01T10:30:00' })
    const third = makeTask({ id: 3, due_date: '2026-01-01T10:00:00', end_date: '2026-01-01T11:00:00' })

    const layouts = layoutTimedTasks([first, second, third])

    expect(layouts[0].leftPercent).toBe(0)
    expect(layouts[0].widthPercent).toBeCloseTo(49.25)
    expect(layouts[1].leftPercent).toBeCloseTo(50.75)
    expect(layouts[1].widthPercent).toBeCloseTo(49.25)
    expect(layouts[2].leftPercent).toBe(0)
    expect(layouts[2].widthPercent).toBeCloseTo(49.25)
  })

  it('首尾相接的任务不算重叠', () => {
    const first = makeTask({ id: 1, due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T10:00:00' })
    const second = makeTask({ id: 2, due_date: '2026-01-01T10:00:00', end_date: '2026-01-01T11:00:00' })

    const layouts = layoutTimedTasks([first, second])

    expect(layouts[0]).toMatchObject({ leftPercent: 0, widthPercent: 100 })
    expect(layouts[1]).toMatchObject({ leftPercent: 0, widthPercent: 100 })
  })

  it('无结束时间时按默认 30 分钟高度布局', () => {
    const task = makeTask({ due_date: '2026-01-01T12:15:00', end_date: null })

    const [layout] = layoutTimedTasks([task])

    expect(layout).toMatchObject({ top: 735, height: 30, leftPercent: 0, widthPercent: 100 })
  })

  it('无效结束时间时按默认 30 分钟高度布局', () => {
    const task = makeTask({ due_date: '2026-01-01T12:00:00', end_date: 'not-a-date' })

    const [layout] = layoutTimedTasks([task])

    expect(layout).toMatchObject({ top: 720, height: 30, leftPercent: 0, widthPercent: 100 })
  })

  it('无开始时间时 top 为 0 且高度为 30', () => {
    const task = makeTask({ due_date: null, end_date: '2026-01-01T12:00:00' })

    const [layout] = layoutTimedTasks([task])

    expect(layout).toMatchObject({ top: 0, height: 30 })
  })
})

// 跨日定时任务在时间网格内的纵向窗口：按「每日可读时段」而不是完整跨日时长
describe('getCrossDayTimedWindow', () => {
  it('04:00 → 次日 05:00：约一小时可读块高（不是 25 小时）', () => {
    expect(
      getCrossDayTimedWindow(makeTask({ due_date: '2026-01-01T04:00:00', end_date: '2026-01-02T05:00:00' })),
    ).toEqual({
      startMinute: 240,
      heightMinutes: 60,
    })
  })

  it('22:00 → 次日 02:00：高度到当日 24:00（2 小时），不越界', () => {
    const window = getCrossDayTimedWindow(
      makeTask({ due_date: '2026-01-01T22:00:00', end_date: '2026-01-02T02:00:00' }),
    )
    expect(window).toEqual({ startMinute: 1320, heightMinutes: 120 })
    expect(window!.startMinute + window!.heightMinutes).toBeLessThanOrEqual(24 * 60)
  })

  it('同一时分跨日：使用上限高度（4 小时），不出现负高度或撑满网格', () => {
    expect(
      getCrossDayTimedWindow(makeTask({ due_date: '2026-01-01T09:00:00', end_date: '2026-01-02T09:00:00' })),
    ).toEqual({
      startMinute: 540,
      heightMinutes: 240,
    })
  })

  it('超过两天：按每日窗口计算并夹在上限内', () => {
    expect(
      getCrossDayTimedWindow(makeTask({ due_date: '2026-01-01T09:00:00', end_date: '2026-01-03T17:00:00' })),
    ).toEqual({
      startMinute: 540,
      heightMinutes: 240,
    })
  })

  it('开始日早于可视周：日期裁剪不改变纵向锚点（仍按真实开始时刻）', () => {
    // 上周五 22:00 → 本周五 05:00；无论从哪一周查看，锚点都应是 22:00、窗口 120 分钟
    const window = getCrossDayTimedWindow(
      makeTask({ due_date: '2025-12-26T22:00:00', end_date: '2026-01-02T05:00:00' }),
    )
    expect(window).toEqual({ startMinute: 1320, heightMinutes: 120 })
  })

  it('无有效结束或未跨日时返回 null（由单日布局处理）', () => {
    expect(getCrossDayTimedWindow(makeTask({ due_date: '2026-01-01T09:00:00', end_date: null }))).toBeNull()
    expect(
      getCrossDayTimedWindow(makeTask({ due_date: '2026-01-01T09:00:00', end_date: '2026-01-01T08:00:00' })),
    ).toBeNull()
  })

  it('所有取值都不越出单日 24 小时范围', () => {
    const cases = [
      ['2026-01-01T00:00:00', '2026-01-02T00:00:01'],
      ['2026-01-01T23:59:00', '2026-01-02T00:00:00'],
      ['2026-01-01T12:00:00', '2026-01-04T12:00:00'],
    ]
    for (const [start, end] of cases) {
      const window = getCrossDayTimedWindow(makeTask({ due_date: start, end_date: end }))
      expect(window).not.toBeNull()
      // 23:59 等当日最后一分钟的起点会被剩余时长截短，但仍须为正且不越界
      expect(window!.heightMinutes).toBeGreaterThan(0)
      expect(window!.heightMinutes).toBeLessThanOrEqual(240)
      expect(window!.startMinute + window!.heightMinutes).toBeLessThanOrEqual(24 * 60)
    }
  })
})

describe('layoutWeekTimedConflicts', () => {
  const item = (id: string, kind: 'single' | 'cross', columns: number[], startMinute: number, endMinute: number) => ({
    id,
    kind,
    columns,
    startMinute,
    endMinute,
  })

  interface DisplayRect {
    id: string
    column: number
    left: number
    width: number
    top: number
    bottom: number
  }

  /** 由布局项还原最终显示矩形（列 + 横向区间 + 纵向区间），用于二维不相交断言 */
  function displayRects(
    items: Array<{ id: string; columns: readonly number[] }>,
    layout: ReturnType<typeof layoutWeekTimedConflicts>,
  ): DisplayRect[] {
    return items.flatMap((entry) =>
      entry.columns.map((column) => {
        const current = layout.get(entry.id)!
        const top =
          current.mode === 'strip'
            ? current.displayStartMinute + current.stripIndex * current.displayHeightMinutes
            : current.displayStartMinute
        const position =
          current.mode === 'strip'
            ? { leftPercent: 0, widthPercent: 100 }
            : computeLanePosition(current.lane, current.laneCount)
        return {
          id: entry.id,
          column,
          left: position.leftPercent,
          width: position.widthPercent,
          top,
          bottom: top + current.displayHeightMinutes,
        }
      }),
    )
  }

  function expectNoDisplayOverlaps(
    items: Array<{ id: string; columns: readonly number[] }>,
    layout: ReturnType<typeof layoutWeekTimedConflicts>,
  ) {
    const rects = displayRects(items, layout)
    const epsilon = 1e-6
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        if (a.column !== b.column) continue
        const horizontalOverlap = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
        const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        expect(
          horizontalOverlap > epsilon && verticalOverlap > epsilon,
          `${a.id} 与 ${b.id} 在列 ${a.column} 发生显示碰撞：x=${horizontalOverlap}, y=${verticalOverlap}`,
        ).toBe(false)
      }
    }
  }

  /** 最终显示矩形必须留在 00:00-24:00 的有效日网格内 */
  function expectWithinDayGrid(
    items: Array<{ id: string; columns: readonly number[] }>,
    layout: ReturnType<typeof layoutWeekTimedConflicts>,
  ) {
    for (const rect of displayRects(items, layout)) {
      expect(rect.top, `${rect.id} top 越出日网格`).toBeGreaterThanOrEqual(-1e-6)
      expect(rect.bottom, `${rect.id} bottom 越出日网格`).toBeLessThanOrEqual(24 * 60 + 1e-6)
    }
  }

  it('单条跨日任务：独占整条，显示窗口即真实窗口', () => {
    const layout = layoutWeekTimedConflicts([item('a', 'cross', [0, 1], 540, 600)])
    expect(layout.get('a')).toMatchObject({
      mode: 'strip',
      stripIndex: 0,
      stripCount: 1,
      displayStartMinute: 540,
      displayHeightMinutes: 60,
    })
  })

  it('两条同时间跨日任务：同窗口内分竖直子轨道，各自整列宽且连续', () => {
    const layout = layoutWeekTimedConflicts([
      item('a', 'cross', [0, 1], 540, 600),
      item('b', 'cross', [0, 1], 540, 600),
    ])
    expect(layout.get('a')).toMatchObject({ mode: 'strip', stripIndex: 0, stripCount: 2 })
    expect(layout.get('b')).toMatchObject({ mode: 'strip', stripIndex: 1, stripCount: 2 })
    for (const id of ['a', 'b']) {
      expect(layout.get(id)!.displayStartMinute).toBe(540)
      expect(layout.get(id)!.displayHeightMinutes).toBe(30)
    }
  })

  it('跨日 + 单日完全重叠：跨日横带保持锚点，单日任务整体让位到其后', () => {
    const items = [item('cross', 'cross', [0, 1], 540, 600), item('single', 'single', [1], 540, 600)]
    const layout = layoutWeekTimedConflicts(items)
    expect(layout.get('cross')).toMatchObject({
      mode: 'strip',
      stripIndex: 0,
      stripCount: 1,
      displayStartMinute: 540,
      displayHeightMinutes: 60,
    })
    expect(layout.get('single')).toMatchObject({
      mode: 'strip',
      stripIndex: 0,
      stripCount: 1,
      displayStartMinute: 600,
      displayHeightMinutes: 60,
    })
    expectNoDisplayOverlaps(items, layout)
  })

  it('部分重叠（09:00-10:00 vs 09:01-10:01）：跨日横带不因单日任务改变锚点', () => {
    const items = [item('a', 'cross', [0, 1], 540, 600), item('b', 'single', [1], 541, 601)]
    const layout = layoutWeekTimedConflicts(items)
    const a = layout.get('a')!
    const b = layout.get('b')!
    expect(a.mode).toBe('strip')
    expect(b.mode).toBe('strip')
    // 跨日横带保持 09:00-10:00；单日任务无 ≥18 分钟窗口空档，整体让位到 10:00 之后
    expect(a.displayStartMinute).toBe(540)
    expect(a.displayHeightMinutes).toBe(60)
    expect(b.displayStartMinute).toBe(600)
    expect(b.displayHeightMinutes).toBe(60)
    expectNoDisplayOverlaps(items, layout)
  })

  it('包含关系（长任务包含短任务）：跨日横带保持完整窗口，短任务让位到其后', () => {
    const items = [item('long', 'cross', [0, 1], 540, 660), item('short', 'single', [1], 570, 600)]
    const layout = layoutWeekTimedConflicts(items)
    const long = layout.get('long')!
    const short = layout.get('short')!
    expect(long.mode).toBe('strip')
    expect(short.mode).toBe('strip')
    // 跨日横带保持 09:00-11:00 完整窗口；短任务无法在内部获得 ≥18 分钟空档，整体让位到 11:00 之后
    expect(long.displayStartMinute).toBe(540)
    expect(long.displayHeightMinutes).toBe(120)
    expect(short.displayStartMinute).toBe(660)
    expect(short.displayHeightMinutes).toBe(30)
    expectNoDisplayOverlaps(items, layout)
  })

  it('链式重叠（A-B-C 串行）：跨日横带保持自身锚点，单日任务顺序让位', () => {
    const layout = layoutWeekTimedConflicts([
      item('a', 'cross', [0, 1], 540, 600),
      item('b', 'single', [1], 570, 630),
      item('c', 'single', [1], 600, 660),
    ])
    const a = layout.get('a')!
    const b = layout.get('b')!
    const c = layout.get('c')!
    // A 保持自身窗口 09:00-10:00；B 让位到 [10:00,10:30]；C 让位到 [10:30,11:00]
    expect(a.displayStartMinute).toBe(540)
    expect(a.displayHeightMinutes).toBe(60)
    expect(b.displayStartMinute).toBe(600)
    expect(b.displayHeightMinutes).toBe(30)
    expect(c.displayStartMinute).toBe(630)
    expect(c.displayHeightMinutes).toBe(30)
    // 显示区间两两不重叠
    expect(a.displayStartMinute + a.displayHeightMinutes).toBeLessThanOrEqual(b.displayStartMinute)
    expect(b.displayStartMinute + b.displayHeightMinutes).toBeLessThanOrEqual(c.displayStartMinute)
  })

  it('一分钟 / 两分钟短重叠：单日任务让位到横带之后的空档，横带保持全高', () => {
    const oneMinute = layoutWeekTimedConflicts([
      item('cross', 'cross', [0, 1], 540, 600),
      item('single', 'single', [1], 599, 659),
    ])
    expect(oneMinute.get('cross')).toMatchObject({
      displayStartMinute: 540,
      displayHeightMinutes: 60,
    })
    expect(oneMinute.get('single')).toMatchObject({
      displayStartMinute: 600,
      displayHeightMinutes: 59,
    })

    const twoMinutes = layoutWeekTimedConflicts([
      item('cross', 'cross', [0, 1], 540, 600),
      item('single', 'single', [1], 598, 658),
    ])
    expect(twoMinutes.get('single')).toMatchObject({
      displayStartMinute: 600,
      displayHeightMinutes: 58,
    })
  })

  it('密集场景（五项同窗口）：跨日先分轨，单日顺序让位，最终矩形两两不相交', () => {
    const items = [
      item('a', 'cross', [0, 1], 540, 600),
      item('b', 'cross', [0, 1], 540, 600),
      item('c', 'single', [0], 540, 600),
      item('d', 'single', [1], 540, 600),
      item('e', 'single', [0], 540, 600),
    ]
    const layout = layoutWeekTimedConflicts(items)
    // 两条跨日任务先在同窗口内均分为两条 30 分钟轨道
    expect(layout.get('a')).toMatchObject({ displayStartMinute: 540, displayHeightMinutes: 30 })
    expect(layout.get('b')).toMatchObject({ displayStartMinute: 540, displayHeightMinutes: 30 })
    expect(layout.get('b')!.stripIndex).toBe(1)
    // 单日任务无法在窗口中让位，按显示起点顺序整体排到横带之后
    const c = layout.get('c')!
    const d = layout.get('d')!
    const e = layout.get('e')!
    expect(c).toMatchObject({ displayStartMinute: 600, displayHeightMinutes: 60 })
    expect(d).toMatchObject({ displayStartMinute: 600, displayHeightMinutes: 60 })
    expect(e).toMatchObject({ displayStartMinute: 660, displayHeightMinutes: 60 })
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      expect(layout.get(id)!.displayHeightMinutes).toBeGreaterThanOrEqual(18)
    }
    expectNoDisplayOverlaps(items, layout)
  })

  it('跨周稳定：同一周仅存在部分冲突时，横带锚点与高度不变', () => {
    const noConflict = layoutWeekTimedConflicts([item('a', 'cross', [0, 1], 540, 600)])
    const withPartialConflict = layoutWeekTimedConflicts([
      item('a', 'cross', [0, 1], 540, 600),
      item('b', 'single', [1], 570, 630),
    ])
    expect(withPartialConflict.get('a')!.displayStartMinute).toBe(noConflict.get('a')!.displayStartMinute)
    expect(withPartialConflict.get('a')!.displayHeightMinutes).toBe(noConflict.get('a')!.displayHeightMinutes)
    // 单日任务让位到 [10:00,10:30]
    expect(withPartialConflict.get('b')).toMatchObject({ displayStartMinute: 600, displayHeightMinutes: 30 })
  })

  it('两条跨日 + 两条单日：跨日先分轨，分列单日任务在横带之后复用同一纵向位置', () => {
    const items = [
      item('a', 'cross', [0, 1], 540, 600),
      item('b', 'cross', [0, 1], 540, 600),
      item('c', 'single', [0], 540, 600),
      item('d', 'single', [1], 540, 600),
    ]
    const layout = layoutWeekTimedConflicts(items)
    expect(layout.get('a')).toMatchObject({ stripIndex: 0, stripCount: 2, displayStartMinute: 540 })
    expect(layout.get('b')).toMatchObject({ stripIndex: 1, stripCount: 2, displayStartMinute: 540 })
    expect(layout.get('a')!.displayHeightMinutes).toBe(30)
    // C 与 D 分处不同日列，可复用同一让位起点；同列不会与 A/B 重叠
    expect(layout.get('c')).toMatchObject({ displayStartMinute: 600, displayHeightMinutes: 60 })
    expect(layout.get('d')).toMatchObject({ displayStartMinute: 600, displayHeightMinutes: 60 })
    expectNoDisplayOverlaps(items, layout)
  })

  it('纯单日任务重叠：保持既有横向分列，不进入子轨道', () => {
    const layout = layoutWeekTimedConflicts([
      item('a', 'single', [0], 540, 600),
      item('b', 'single', [0], 540, 600),
      item('c', 'single', [0], 600, 660),
    ])
    expect(layout.get('a')).toMatchObject({ mode: 'lane', lane: 0, laneCount: 2 })
    expect(layout.get('b')).toMatchObject({ mode: 'lane', lane: 1, laneCount: 2 })
    expect(layout.get('c')).toMatchObject({ mode: 'lane', lane: 0, laneCount: 1 })
  })

  it('无冲突的单日任务：占满整列', () => {
    const layout = layoutWeekTimedConflicts([item('a', 'single', [0], 540, 600)])
    expect(layout.get('a')).toMatchObject({ mode: 'lane', lane: 0, laneCount: 1 })
  })

  it('不同原始冲突组：前组扩展后遇到后续任务时按最终矩形继续向下让位', () => {
    const items = [
      item('crossA', 'cross', [0, 1], 540, 600),
      item('crossB', 'cross', [0, 1], 540, 600),
      item('singleA', 'single', [0], 540, 600),
      item('singleB', 'single', [0], 540, 600),
      // 原始时间与原冲突组首尾相接（10:00 开始），属于另一个冲突组
      item('later', 'single', [0], 600, 660),
    ]
    const layout = layoutWeekTimedConflicts(items)
    expect(layout.get('crossA')).toMatchObject({ displayStartMinute: 540, displayHeightMinutes: 30 })
    expect(layout.get('crossB')).toMatchObject({ displayStartMinute: 540, displayHeightMinutes: 30 })
    // 单日任务依次让位；later 被前组最终显示矩形推后，绝不覆盖其勾选框
    const singleA = layout.get('singleA')!
    const singleB = layout.get('singleB')!
    const later = layout.get('later')!
    expect(singleA.displayStartMinute).toBe(600)
    expect(singleB.displayStartMinute).toBe(660)
    expect(later.displayStartMinute).toBeGreaterThanOrEqual(720)
    expectNoDisplayOverlaps(items, layout)
  })

  it('同组不同重叠簇：簇内最小高度扩展后仍按最终矩形避让后续任务', () => {
    const items = [
      item('cross', 'cross', [0, 1], 540, 600),
      item('shortA', 'single', [0], 599, 629),
      item('shortB', 'single', [0], 605, 635),
    ]
    const layout = layoutWeekTimedConflicts(items)
    const cross = layout.get('cross')!
    const shortA = layout.get('shortA')!
    const shortB = layout.get('shortB')!
    // 跨日横带保持自身锚点；两个单日任务均在窗口内无法获得 ≥18 分钟空档
    expect(cross.displayStartMinute).toBe(540)
    expect(cross.displayHeightMinutes).toBe(60)
    expect(shortA.displayStartMinute).toBe(600)
    expect(shortB.displayStartMinute).toBe(629)
    expectNoDisplayOverlaps(items, layout)
  })

  it('纯单日横向分列：最小高度扩展后跨组按二维矩形避让', () => {
    const items = [
      item('a', 'single', [0], 540, 550),
      item('b', 'single', [0], 540, 550),
      // 与 a/b 原始时间不重叠（另一个冲突组），但扩展后与 a 的显示矩形相交
      item('c', 'single', [0], 550, 560),
    ]
    const layout = layoutWeekTimedConflicts(items)
    expect(layout.get('a')).toMatchObject({ mode: 'lane', lane: 0, laneCount: 2 })
    expect(layout.get('b')).toMatchObject({ mode: 'lane', lane: 1, laneCount: 2 })
    expect(layout.get('a')!.displayHeightMinutes).toBe(18)
    expect(layout.get('b')!.displayHeightMinutes).toBe(18)
    // c 为整列宽：与 a/b 的横向区间相交，因此必须沿纵向避让到 558 之后
    expect(layout.get('c')!.laneCount).toBe(1)
    expect(layout.get('c')!.displayStartMinute).toBe(558)
    expectNoDisplayOverlaps(items, layout)
  })

  it('跨周稳定：部分重叠 / 包含 / 完全重叠都不改变跨日任务锚点与高度', () => {
    const crossOnly = layoutWeekTimedConflicts([item('cross', 'cross', [0, 1], 540, 600)])
    const baseline = crossOnly.get('cross')!

    const partial = layoutWeekTimedConflicts([
      item('cross', 'cross', [0, 1], 540, 600),
      item('single', 'single', [1], 570, 630),
    ])
    expect(partial.get('cross')!.displayStartMinute).toBe(baseline.displayStartMinute)
    expect(partial.get('cross')!.displayHeightMinutes).toBe(baseline.displayHeightMinutes)

    const contained = layoutWeekTimedConflicts([
      item('cross', 'cross', [0, 1], 540, 660),
      item('single', 'single', [1], 570, 600),
    ])
    const containedBaseline = layoutWeekTimedConflicts([item('cross', 'cross', [0, 1], 540, 660)]).get('cross')!
    expect(contained.get('cross')!.displayStartMinute).toBe(containedBaseline.displayStartMinute)
    expect(contained.get('cross')!.displayHeightMinutes).toBe(containedBaseline.displayHeightMinutes)

    const fullyOverlapped = layoutWeekTimedConflicts([
      item('cross', 'cross', [0, 1], 540, 600),
      item('single', 'single', [1], 540, 600),
    ])
    expect(fullyOverlapped.get('cross')!.displayStartMinute).toBe(baseline.displayStartMinute)
    expect(fullyOverlapped.get('cross')!.displayHeightMinutes).toBe(baseline.displayHeightMinutes)
  })

  it('跨周稳定：跨日任务之间只看稳定日期列，可见列裁剪不改变分轨结果', () => {
    const stableA = [100, 101]
    const stableB = [101, 102]
    const itemsForWeek = (visibleB: boolean) => [
      { ...item('a', 'cross', visibleB ? [0, 1] : [0, 1], 540, 600), stableColumns: stableA },
      {
        ...item('b', 'cross', visibleB ? [1, 2] : [], 540, 600),
        stableColumns: stableB,
      },
    ]
    const week1 = layoutWeekTimedConflicts(itemsForWeek(false))
    const week2 = layoutWeekTimedConflicts(itemsForWeek(true))
    for (const id of ['a', 'b']) {
      expect(week1.get(id)!.displayStartMinute).toBe(week2.get(id)!.displayStartMinute)
      expect(week1.get(id)!.displayHeightMinutes).toBe(week2.get(id)!.displayHeightMinutes)
      expect(week1.get(id)!.stripIndex).toBe(week2.get(id)!.stripIndex)
    }
    expectNoDisplayOverlaps(itemsForWeek(true), week2)
  })

  it('跨日任务不同重叠簇扩展后：按最终矩形继续向下打包，不与后一簇重叠', () => {
    const items = [
      item('a', 'cross', [0, 1], 540, 600),
      item('b', 'cross', [0, 1], 570, 630),
      item('c', 'cross', [0, 1], 600, 660),
    ]
    const layout = layoutWeekTimedConflicts(items)
    expectNoDisplayOverlaps(items, layout)
    // c 不能被 b 的最小高度扩展覆盖
    expect(layout.get('c')!.displayStartMinute).toBeGreaterThanOrEqual(
      layout.get('b')!.displayStartMinute + layout.get('b')!.displayHeightMinutes,
    )
  })

  it('深夜四任务：向下越过 24:00 时向上让位，全部留在有效日网格内', () => {
    const items = [
      item('crossA', 'cross', [0, 1], 1380, 1410),
      item('crossB', 'cross', [0, 1], 1380, 1410),
      item('singleA', 'single', [0], 1380, 1410),
      item('singleB', 'single', [0], 1380, 1410),
    ]
    const layout = layoutWeekTimedConflicts(items)
    // 两条跨日横带 1380-1398、1398-1416；单日任务无法向下排入剩余 24 分钟，
    // 依次向上让位到 1350-1380、1320-1350，且保持 30 分钟真实块高
    expect(layout.get('crossA')).toMatchObject({ displayStartMinute: 1380, displayHeightMinutes: 18 })
    expect(layout.get('crossB')!.stripIndex).toBe(1)
    expect(layout.get('singleA')).toMatchObject({ displayStartMinute: 1350, displayHeightMinutes: 30 })
    expect(layout.get('singleB')).toMatchObject({ displayStartMinute: 1320, displayHeightMinutes: 30 })
    expectWithinDayGrid(items, layout)
    expectNoDisplayOverlaps(items, layout)
  })

  it('深夜四条跨日横带：第 4 条越过日界时向上让位，横带仍各自连续', () => {
    const items = [
      item('a', 'cross', [0, 1], 1380, 1410),
      item('b', 'cross', [0, 1], 1380, 1410),
      item('c', 'cross', [0, 1], 1380, 1410),
      item('d', 'cross', [0, 1], 1380, 1410),
    ]
    const layout = layoutWeekTimedConflicts(items)
    // a/b/c 顺序向下 1380-1398、1398-1416、1416-1434；d 无法再向下，向上到 1362-1380
    expect(layout.get('a')).toMatchObject({ displayStartMinute: 1380, displayHeightMinutes: 18 })
    expect(layout.get('b')!.stripIndex).toBe(1)
    expect(layout.get('c')!.stripIndex).toBe(2)
    const d = layout.get('d')!
    // strip 模式下 displayStartMinute 是窗口起点；实际显示顶部 = 起点 + 轨道序号 × 轨道高
    expect(d.displayStartMinute + d.stripIndex * d.displayHeightMinutes).toBe(1362)
    expect(d.displayHeightMinutes).toBe(18)
    expectWithinDayGrid(items, layout)
    expectNoDisplayOverlaps(items, layout)
  })

  it('顶部边界：00:00 冲突只在 0 点之后排布，不产生负 top', () => {
    const items = [
      item('crossA', 'cross', [0, 1], 0, 30),
      item('crossB', 'cross', [0, 1], 0, 30),
      item('singleA', 'single', [0], 0, 30),
      item('singleB', 'single', [0], 0, 30),
    ]
    const layout = layoutWeekTimedConflicts(items)
    expect(layout.get('crossA')).toMatchObject({ displayStartMinute: 0, displayHeightMinutes: 18 })
    expect(layout.get('crossB')!.stripIndex).toBe(1)
    expect(layout.get('singleA')).toMatchObject({ displayStartMinute: 36, displayHeightMinutes: 30 })
    expect(layout.get('singleB')).toMatchObject({ displayStartMinute: 66, displayHeightMinutes: 30 })
    expectWithinDayGrid(items, layout)
    expectNoDisplayOverlaps(items, layout)
  })

  it('与 layoutTimedTasks 使用同一列位置公式', () => {
    expect(computeLanePosition(0, 2)).toEqual({ leftPercent: 0, widthPercent: 49.25 })
    expect(computeLanePosition(1, 2)).toEqual({ leftPercent: 50.75, widthPercent: 49.25 })
  })
})
