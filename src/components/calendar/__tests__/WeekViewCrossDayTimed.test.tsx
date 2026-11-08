import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { WeekView } from '../WeekView'

/**
 * 周视图「定时跨日任务留在时间网格」回归。
 *
 * 规则：
 * - 只有全天（或整天跨度）任务进入顶部全天区；定时任务跨日时仍在时间网格，
 *   按日渲染为横向相接的分段块，纵向位置取开始时刻，高度按「每日可读时段」计算。
 * - 04:00 → 次日 05:00 约 1 小时块高；22:00 → 次日 02:00 到当日 24:00；
 *   同一时分跨日使用 4 小时上限；不出现负高度或越界。
 * - 裁剪边界不冒充真实端点：只有真实起止段带左右日期手柄；跨日段不渲染上下时间手柄。
 */

const lists: List[] = [
  {
    id: 1,
    name: '默认清单',
    color: '#3b82f6',
    is_default: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
]

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  const dueDate = '2026-07-01T09:00:00'
  return {
    id,
    title: `跨日定时任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: dueDate,
    end_date: '2026-07-01T10:00:00',
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: dueDate,
    updated_at: dueDate,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

/** 默认周为 2026-06-29(周一) .. 2026-07-05(周日)，currentDate 周三 07-01 */
function renderWeekView(tasks: Task[], currentDate: Date = new Date(2026, 6, 1)) {
  const onTaskClick = vi.fn()
  const onToggleTask = vi.fn()
  const onUpdateTask = vi.fn()
  const view = render(
    <WeekView
      currentDate={currentDate}
      tasks={tasks}
      lists={lists}
      onDateClick={vi.fn()}
      onTaskClick={onTaskClick}
      onToggleTask={onToggleTask}
      onPrevWeek={vi.fn()}
      onNextWeek={vi.fn()}
      onToday={vi.fn()}
      onMoveTask={vi.fn()}
      onCreateTaskOnRange={vi.fn()}
      onUpdateTask={onUpdateTask}
    />,
  )
  return {
    container: view.container,
    unmount: view.unmount,
    onTaskClick,
    onToggleTask,
    onUpdateTask,
  }
}

function getSegments(container: HTMLElement, taskId: number): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[data-task][data-task-id="${taskId}"]`))
}

describe('周视图定时跨日任务布局', () => {
  it('04:00 → 次日 05:00：留在时间网格并横向分为两段，每段约 1 小时块高', () => {
    const task = makeTask(1, { due_date: '2026-07-01T04:00:00', end_date: '2026-07-02T05:00:00' })
    const { container } = renderWeekView([task])

    // 顶部全天区没有该任务条
    expect(screen.queryByTestId('calendar-all-day-task-1')).not.toBeInTheDocument()

    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(2)
    for (const segment of segments) {
      expect(segment.style.top).toBe('240px') // 04:00
      expect(segment.style.height).toBe('60px') // 约 1 小时，而非 25 小时
    }

    // 两段分别位于周三、周四列
    const wedColumn = screen.getByTestId('week-time-column-2026-07-01')
    const thuColumn = screen.getByTestId('week-time-column-2026-07-02')
    expect(wedColumn.contains(segments[0])).toBe(true)
    expect(thuColumn.contains(segments[1])).toBe(true)
  })

  it('22:00 → 次日 02:00：高度到当日 24:00（2 小时），不越出网格', () => {
    const task = makeTask(1, { due_date: '2026-07-01T22:00:00', end_date: '2026-07-02T02:00:00' })
    const { container } = renderWeekView([task])

    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(2)
    for (const segment of segments) {
      expect(segment.style.top).toBe('1320px')
      expect(segment.style.height).toBe('120px')
      expect(1320 + Number.parseFloat(segment.style.height)).toBeLessThanOrEqual(24 * 60)
    }
  })

  it('同一时分跨日：使用可读上限高度（4 小时），不出现负高度', () => {
    const task = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T09:00:00' })
    const { container } = renderWeekView([task])

    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(2)
    for (const segment of segments) {
      expect(segment.style.top).toBe('540px')
      expect(segment.style.height).toBe('240px')
    }
  })

  it('结束恰好 00:00 不是跨日：仍按单日定时块渲染', () => {
    const task = makeTask(1, { due_date: '2026-07-01T22:00:00', end_date: '2026-07-02T00:00:00' })
    const { container } = renderWeekView([task])

    expect(screen.queryByTestId('calendar-all-day-task-1')).not.toBeInTheDocument()
    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(1)
    expect(segments[0].style.top).toBe('1320px')
    expect(segments[0].style.height).toBe('120px')
  })

  it('无 end_date 的定时任务保持单日 30 分钟块', () => {
    const task = makeTask(1, { end_date: null })
    const { container } = renderWeekView([task])

    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(1)
    expect(segments[0].style.height).toBe('30px')
  })

  it('起点在上周（跨周裁剪）：本周全部日段受影响，裁剪边界不显示左手柄，真实结束日显示右手柄', () => {
    // 上周五 22:00 → 本周三 05:00：本周一/二为 middle，周三为 end
    const task = makeTask(1, { due_date: '2026-06-26T22:00:00', end_date: '2026-07-01T05:00:00' })
    const { container, onTaskClick } = renderWeekView([task])

    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(3)
    for (const segment of segments) {
      // 日期裁剪只影响横向可见范围；纵向锚点仍按真实开始时刻 22:00，窗口到当日 24:00
      expect(segment.style.top).toBe('1320px')
      expect(segment.style.height).toBe('120px')
    }

    const allSegments = container.querySelectorAll('[data-task][data-task-id="1"]')
    const startHandles = container.querySelectorAll('[data-task][data-task-id="1"] [data-span-resize-handle="start"]')
    const endHandles = container.querySelectorAll('[data-task][data-task-id="1"] [data-span-resize-handle="end"]')
    expect(allSegments).toHaveLength(3)
    expect(startHandles).toHaveLength(0) // 起点在上周：裁剪边界不冒充真实端点
    expect(endHandles).toHaveLength(1) // 真实结束仍在周三

    // 点击任一日段仍打开同一任务
    fireEvent.click(segments[1])
    expect(onTaskClick).toHaveBeenCalledWith(1)
  })

  it('真实起止段显示左右日期手柄，middle 段无手柄；跨日段不渲染上下时间手柄', () => {
    // 周三 22:00 → 周五 02:00：周三 start、周四 middle、周五 end
    const task = makeTask(1, { due_date: '2026-07-01T22:00:00', end_date: '2026-07-03T02:00:00' })
    const { container } = renderWeekView([task])

    const segments = getSegments(container, 1)
    expect(segments).toHaveLength(3)
    expect(segments[0].querySelector('[data-span-resize-handle="start"]')).not.toBeNull()
    expect(segments[0].querySelector('[data-span-resize-handle="end"]')).toBeNull()
    expect(segments[1].querySelector('[data-span-resize-handle]')).toBeNull()
    expect(segments[2].querySelector('[data-span-resize-handle="end"]')).not.toBeNull()
    expect(segments[2].querySelector('[data-span-resize-handle="start"]')).toBeNull()

    // 上下时间手柄只适用于单日任务；跨日段套用单日算法会错误改写结束时间
    for (const segment of segments) {
      expect(segment.querySelectorAll('[data-resize-handle]')).toHaveLength(0)
    }
  })

  it('跨日段与单日任务重叠：跨日横带保持锚点，单日任务让位到其后且互不遮挡', () => {
    const crossDay = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const singleDay = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    const { container, onTaskClick, onToggleTask } = renderWeekView([crossDay, singleDay])

    const [crossBlock] = getSegments(container, 1)
    const [singleBlock] = getSegments(container, 2)
    // 跨日任务保持 09:00-10:00；单日任务无法在窗口内让位，整体排在横带之后
    expect(crossBlock.style.top).toBe('540px')
    expect(crossBlock.style.height).toBe('60px')
    expect(singleBlock.style.top).toBe('600px')
    expect(singleBlock.style.height).toBe('60px')
    for (const block of [crossBlock, singleBlock]) {
      expect(block.style.left).toBe('0%')
      expect(block.style.width).toBe('100%')
    }

    fireEvent.click(singleBlock.querySelector('input[type="checkbox"]') as HTMLElement)
    expect(onToggleTask).toHaveBeenCalledWith(2)
    expect(onToggleTask).not.toHaveBeenCalledWith(1)
    fireEvent.click(crossBlock)
    expect(onTaskClick).toHaveBeenCalledWith(1)
  })

  it('定时跨日段的提示包含完整真实起止时间', () => {
    const task = makeTask(1, { due_date: '2026-07-01T22:00:00', end_date: '2026-07-03T02:00:00' })
    const { container } = renderWeekView([task])

    const [firstSegment] = getSegments(container, 1)
    expect(firstSegment.getAttribute('title')).toContain('周三 22:00 → 周五 02:00')
  })

  it('保持兼容：午夜到午夜的整天跨度任务（all_day=false）仍在顶部全天区', () => {
    const task = makeTask(1, { due_date: '2026-07-01T00:00:00', end_date: '2026-07-02T00:00:00' })
    const { container } = renderWeekView([task])

    expect(screen.getAllByTestId('calendar-all-day-task-1')).toHaveLength(1)
    expect(getSegments(container, 1)).toHaveLength(0)
  })

  it('真正全天任务保留顶部显示', () => {
    const task = makeTask(1, { due_date: '2026-07-01T00:00:00', end_date: '2026-07-02T00:00:00', all_day: true })
    renderWeekView([task])

    expect(screen.getAllByTestId('calendar-all-day-task-1')).toHaveLength(1)
  })

  it('同一任务在相邻两周的纵向锚点与窗口高度一致（跨周切换不跳动）', () => {
    // 6/28(周日) 09:00 → 7/1(周三) 10:00：两周都能看到该任务
    const task = makeTask(30, { due_date: '2026-06-28T09:00:00', end_date: '2026-07-01T10:00:00' })

    const week1 = renderWeekView([task], new Date(2026, 5, 24)) // 6/22..6/28
    const week1Segments = getSegments(week1.container, 30)
    expect(week1Segments).toHaveLength(1) // 周日 start 段
    expect(week1Segments[0].style.top).toBe('540px')
    expect(week1Segments[0].style.height).toBe('60px')
    week1.unmount()

    const week2 = renderWeekView([task], new Date(2026, 6, 1)) // 6/29..7/5
    const week2Segments = getSegments(week2.container, 30)
    expect(week2Segments).toHaveLength(3) // 周一/周二 middle + 周三 end
    for (const segment of week2Segments) {
      expect(segment.style.top).toBe('540px')
      expect(segment.style.height).toBe('60px')
    }
  })
})

describe('跨日块与冲突任务的统一冲突布局', () => {
  /** 段在列内的实时几何（jsdom 无布局，用 style 百分比 / 像素换算） */
  function geometry(segment: HTMLElement) {
    return {
      left: Number.parseFloat(segment.style.left),
      width: Number.parseFloat(segment.style.width),
      top: Number.parseFloat(segment.style.top),
      height: Number.parseFloat(segment.style.height),
    }
  }

  /** 同一任务相邻日段：整列宽 + 同纵向范围 → 前段右边缘与后段左边缘在列边界相接 */
  function expectContinuous(segments: HTMLElement[]) {
    const first = geometry(segments[0])
    expect(first.left).toBeCloseTo(0)
    expect(first.width).toBeCloseTo(100)
    for (const segment of segments) {
      const current = geometry(segment)
      expect(current.top).toBeCloseTo(first.top)
      expect(current.height).toBeCloseTo(first.height)
      expect(current.left).toBeCloseTo(first.left)
      expect(current.width).toBeCloseTo(first.width)
      // 整列宽：本段右边缘 = 列右边界，下一段左边缘 = 下一列左边界 → 相接
      expect(current.left + current.width).toBeCloseTo(100)
    }
  }

  function getCheckbox(container: HTMLElement, taskId: number): HTMLInputElement {
    const checkbox = getSegments(container, taskId)[0].querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) throw new Error(`missing checkbox for ${taskId}`)
    return checkbox
  }

  /** 渲染后的最终显示矩形：列 + 横向百分比 + 纵向像素 */
  function renderedRects(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-task][data-task-id]')).map((segment) => {
      const current = geometry(segment)
      return {
        id: segment.getAttribute('data-task-id') ?? '',
        column: segment.closest('[data-testid^="week-time-column-"]')?.getAttribute('data-testid') ?? '',
        left: current.left,
        width: current.width,
        top: current.top,
        height: current.height,
      }
    })
  }

  function expectNoRenderedOverlaps(container: HTMLElement) {
    const rects = renderedRects(container)
    const epsilon = 1e-6
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        if (a.column !== b.column) continue
        const horizontalOverlap = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
        const verticalOverlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
        expect(
          horizontalOverlap > epsilon && verticalOverlap > epsilon,
          `${a.id} 与 ${b.id} 在 ${a.column} 显示碰撞：x=${horizontalOverlap}, y=${verticalOverlap}`,
        ).toBe(false)
      }
    }
  }

  it('末日冲突（A 跨两日、B 只在末日）：跨日横带保持锚点，B 让位且独立可点击', () => {
    // A 7/1 09:00 → 7/2 10:00；B 7/2 09:00-10:00
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const lastDayOnly = makeTask(2, { due_date: '2026-07-02T09:00:00', end_date: '2026-07-02T10:00:00' })
    const { container, onTaskClick, onToggleTask } = renderWeekView([cross, lastDayOnly])

    const crossSegments = getSegments(container, 1)
    expect(crossSegments).toHaveLength(2)
    expectContinuous(crossSegments)
    // A 保持 09:00-10:00；B 在末日让位到 10:00 之后
    expect(geometry(crossSegments[0]).top).toBeCloseTo(540)
    expect(geometry(crossSegments[0]).height).toBeCloseTo(60)
    const b = getSegments(container, 2)[0]
    expect(geometry(b).top).toBeCloseTo(600)
    expect(geometry(b).height).toBeCloseTo(60)
    expect(geometry(b).width).toBeCloseTo(100)

    fireEvent.click(getCheckbox(container, 2))
    expect(onToggleTask).toHaveBeenCalledWith(2)
    expect(onToggleTask).not.toHaveBeenCalledWith(1)
    fireEvent.click(b)
    expect(onTaskClick).toHaveBeenCalledWith(2)
  })

  it('首日冲突（A 跨两日、B 只在首日）：跨日横带连续，B 让位且勾选框命中正确任务', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const firstDayOnly = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    const { container, onTaskClick, onToggleTask } = renderWeekView([cross, firstDayOnly])

    const crossSegments = getSegments(container, 1)
    expectContinuous(crossSegments)
    const b = getSegments(container, 2)[0]
    expect(geometry(b).top).toBeCloseTo(600)
    expect(geometry(b).height).toBeCloseTo(60)

    fireEvent.click(getCheckbox(container, 2))
    expect(onToggleTask).toHaveBeenCalledWith(2)
    fireEvent.click(b)
    expect(onTaskClick).toHaveBeenCalledWith(2)
    fireEvent.click(crossSegments[0])
    expect(onTaskClick).toHaveBeenCalledWith(1)
  })

  it('middle 日冲突：A 三天连续，中间日的单日任务让位到横带之后', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-03T10:00:00' })
    const middleDayOnly = makeTask(2, { due_date: '2026-07-02T09:00:00', end_date: '2026-07-02T10:00:00' })
    const { container, onTaskClick } = renderWeekView([cross, middleDayOnly])

    const crossSegments = getSegments(container, 1)
    expect(crossSegments).toHaveLength(3)
    expectContinuous(crossSegments)
    const b = getSegments(container, 2)[0]
    expect(geometry(b).top).toBeCloseTo(600)
    expect(geometry(b).width).toBeCloseTo(100)

    fireEvent.click(b)
    expect(onTaskClick).toHaveBeenCalledWith(2)
  })

  it('两条同时间跨日任务：同窗口子轨道，各自连续且互不遮挡', () => {
    const first = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const second = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-03T10:00:00' })
    const { container, onTaskClick } = renderWeekView([first, second])

    const firstSegments = getSegments(container, 1)
    const secondSegments = getSegments(container, 2)
    expect(firstSegments).toHaveLength(2)
    expect(secondSegments).toHaveLength(3)
    expectContinuous(firstSegments)
    expectContinuous(secondSegments)
    // 分属不同子轨道（纵向不重叠），均整列宽
    const firstTop = geometry(firstSegments[0]).top
    const secondTop = geometry(secondSegments[0]).top
    expect(firstTop).not.toBeCloseTo(secondTop)
    expect(Math.abs(firstTop - secondTop)).toBeGreaterThanOrEqual(30)

    fireEvent.click(firstSegments[1])
    expect(onTaskClick).toHaveBeenCalledWith(1)
    fireEvent.click(secondSegments[2])
    expect(onTaskClick).toHaveBeenCalledWith(2)
  })

  it('混合冲突（两条跨日 + 首日单日 + 末日单日）：三项子轨道，任务操作区域互不重合', () => {
    // 复现审核问题：A/B 跨周三..周四 09:00-10:00；C 仅周三 09:00-10:00；D 仅周四 09:00-10:00
    const crossA = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const crossB = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const singleWed = makeTask(3, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    const singleThu = makeTask(4, { due_date: '2026-07-02T09:00:00', end_date: '2026-07-02T10:00:00' })
    const { container, onTaskClick, onToggleTask } = renderWeekView([crossA, crossB, singleWed, singleThu])

    const aSegments = getSegments(container, 1)
    const bSegments = getSegments(container, 2)
    expectContinuous(aSegments)
    expectContinuous(bSegments)
    expect(aSegments).toHaveLength(2)
    expect(bSegments).toHaveLength(2)
    // 三条子轨道：A/B/C/D 的纵向顶部两两不同（C 与 D 分处不同日列，可复用同一轨道）
    const tops = [geometry(aSegments[0]).top, geometry(bSegments[0]).top, geometry(getSegments(container, 3)[0]).top]
    expect(new Set(tops).size).toBe(3)
    expect(geometry(getSegments(container, 4)[0]).top).toBeCloseTo(tops[2])
    for (const id of [1, 2, 3, 4]) {
      const block = getSegments(container, id)[0]
      expect(geometry(block).left).toBeCloseTo(0)
      expect(geometry(block).width).toBeCloseTo(100)
    }

    // 勾选框点击命中各自任务，其他任务不被修改
    for (const id of [1, 2, 3, 4]) {
      onToggleTask.mockClear()
      fireEvent.click(getCheckbox(container, id))
      expect(onToggleTask).toHaveBeenCalledTimes(1)
      expect(onToggleTask).toHaveBeenCalledWith(id)
    }
    // 正文点击打开各自任务
    for (const id of [1, 2, 3, 4]) {
      onTaskClick.mockClear()
      fireEvent.click(getSegments(container, id)[0])
      expect(onTaskClick).toHaveBeenCalledWith(id)
    }
  })

  it('部分重叠（09:00-10:00 vs 09:01-10:01）：跨日横带锚点不变，单日任务让位且勾选框命中各自任务', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const singleMinuteLater = makeTask(2, {
      due_date: '2026-07-01T09:01:00',
      end_date: '2026-07-01T10:01:00',
    })
    const { container, onToggleTask } = renderWeekView([cross, singleMinuteLater])

    const crossSegments = getSegments(container, 1)
    expect(crossSegments).toHaveLength(2)
    expectContinuous(crossSegments)
    // 跨日横带保持 09:00-10:00；单日任务没有 ≥18 分钟窗口空档，整体让位到 10:00 之后
    const crossTop = 540
    expect(geometry(crossSegments[0]).top).toBeCloseTo(crossTop)
    expect(geometry(crossSegments[0]).height).toBeCloseTo(60)
    const single = getSegments(container, 2)[0]
    expect(geometry(single).top).toBeCloseTo(600)
    expect(geometry(single).height).toBeCloseTo(60)
    expect(geometry(single).width).toBeCloseTo(100)

    fireEvent.click(getCheckbox(container, 2))
    expect(onToggleTask).toHaveBeenCalledWith(2)
    expect(onToggleTask).not.toHaveBeenCalledWith(1)
  })

  it('包含关系（长任务包含短任务）：跨日横带完整保留，短任务让位到其后', () => {
    const longCross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T12:00:00' })
    const shortSingle = makeTask(2, { due_date: '2026-07-01T09:30:00', end_date: '2026-07-01T10:00:00' })
    const { container, onToggleTask } = renderWeekView([longCross, shortSingle])

    const longSegments = getSegments(container, 1)
    expectContinuous(longSegments)
    // 跨日横带保持 09:00-12:00（180 分钟）；短任务无法在内部获得空档，整体让位到 12:00 之后
    expect(geometry(longSegments[0]).top).toBeCloseTo(540)
    expect(geometry(longSegments[0]).height).toBeCloseTo(180)
    const short = getSegments(container, 2)[0]
    expect(geometry(short).top).toBeCloseTo(720)
    expect(geometry(short).height).toBeCloseTo(30)

    fireEvent.click(getCheckbox(container, 2))
    expect(onToggleTask).toHaveBeenCalledWith(2)
  })

  it('链式重叠（A-B-C 串行）：跨日横带保持锚点，单日任务顺序让位且不重复显示', () => {
    const a = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const b = makeTask(2, { due_date: '2026-07-01T09:30:00', end_date: '2026-07-01T10:30:00' })
    const c = makeTask(3, { due_date: '2026-07-01T10:00:00', end_date: '2026-07-01T11:00:00' })
    const { container, onToggleTask } = renderWeekView([a, b, c])

    const aSegments = getSegments(container, 1)
    expectContinuous(aSegments)
    const bBlock = getSegments(container, 2)[0]
    const cBlock = getSegments(container, 3)[0]
    // A 保持 09:00-10:00；B 让位 [10:00,10:30]；C 让位 [10:30,11:00]
    expect(geometry(aSegments[0]).top).toBeCloseTo(540)
    expect(geometry(aSegments[0]).height).toBeCloseTo(60)
    expect(geometry(bBlock).top).toBeCloseTo(600)
    expect(geometry(bBlock).height).toBeCloseTo(30)
    expect(geometry(cBlock).top).toBeCloseTo(630)
    expect(geometry(cBlock).height).toBeCloseTo(30)
    // 显示区间两两不重叠
    expect(540 + 60).toBeLessThanOrEqual(600)
    expect(600 + 30).toBeLessThanOrEqual(630)

    fireEvent.click(getCheckbox(container, 2))
    expect(onToggleTask).toHaveBeenCalledWith(2)
    fireEvent.click(getCheckbox(container, 3))
    expect(onToggleTask).toHaveBeenCalledWith(3)
  })

  it('一分钟短重叠：单日任务让位到横带之后的空档，勾选框完整可点', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const single = makeTask(2, { due_date: '2026-07-01T09:59:00', end_date: '2026-07-01T10:59:00' })
    const { container, onToggleTask } = renderWeekView([cross, single])

    const crossSegments = getSegments(container, 1)
    expectContinuous(crossSegments)
    // 横带保持 09:00-10:00 全高；单日任务让位到 [10:00,10:59]
    expect(geometry(crossSegments[0]).top).toBeCloseTo(540)
    expect(geometry(crossSegments[0]).height).toBeCloseTo(60)
    const singleBlock = getSegments(container, 2)[0]
    expect(geometry(singleBlock).top).toBeCloseTo(600)
    expect(geometry(singleBlock).height).toBeCloseTo(59)
    expect(geometry(crossSegments[0]).top + geometry(crossSegments[0]).height).toBeLessThanOrEqual(
      geometry(singleBlock).top,
    )

    fireEvent.click(getCheckbox(container, 2))
    expect(onToggleTask).toHaveBeenCalledWith(2)
    expect(onToggleTask).not.toHaveBeenCalledWith(1)
  })

  it('跨周稳定：同一周仅存在部分冲突时，同一任务切周前后锚点与高度不变', () => {
    const cross = makeTask(1, { due_date: '2026-06-28T11:00:00', end_date: '2026-07-01T12:00:00' })
    const conflict = makeTask(2, { due_date: '2026-06-29T11:30:00', end_date: '2026-06-29T12:30:00' })

    const withConflict = renderWeekView([cross, conflict], new Date(2026, 6, 1))
    const currentSegments = getSegments(withConflict.container, 1)
    expectContinuous(currentSegments)
    const currentTop = geometry(currentSegments[0]).top
    const currentHeight = geometry(currentSegments[0]).height
    withConflict.unmount()

    const withoutConflict = renderWeekView([cross], new Date(2026, 5, 24))
    const previousSegments = getSegments(withoutConflict.container, 1)
    const previousTop = geometry(previousSegments[0]).top
    const previousHeight = geometry(previousSegments[0]).height
    withoutConflict.unmount()

    expect(currentTop).toBeCloseTo(660)
    expect(previousTop).toBeCloseTo(660)
    expect(currentHeight).toBeCloseTo(60)
    expect(previousHeight).toBeCloseTo(60)
  })

  it('密集冲突（三条跨日 + 两条单日）：最小轨道高度生效，控件区域互不重叠', () => {
    const mk = (id: number, due: string, end: string) => makeTask(id, { due_date: due, end_date: end })
    const { container, onToggleTask } = renderWeekView([
      mk(1, '2026-07-01T09:00:00', '2026-07-02T10:00:00'),
      mk(2, '2026-07-01T09:00:00', '2026-07-02T10:00:00'),
      mk(3, '2026-07-01T09:00:00', '2026-07-02T10:00:00'),
      mk(4, '2026-07-01T09:00:00', '2026-07-01T10:00:00'),
      mk(5, '2026-07-01T09:00:00', '2026-07-01T10:00:00'),
    ])
    const tops = new Set<number>()
    for (const id of [1, 2, 3, 4, 5]) {
      const block = getSegments(container, id)[0]
      expect(geometry(block).height).toBeGreaterThanOrEqual(18)
      tops.add(geometry(block).top)
    }
    expect(tops.size).toBeGreaterThanOrEqual(4)
    fireEvent.click(getCheckbox(container, 4))
    expect(onToggleTask).toHaveBeenCalledWith(4)
    fireEvent.click(getCheckbox(container, 5))
    expect(onToggleTask).toHaveBeenCalledWith(5)
  })

  it('同组不同重叠簇：最小高度扩展后最终显示矩形仍不相交，勾选框各归其主', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const shortA = makeTask(2, { due_date: '2026-07-01T09:59:00', end_date: '2026-07-01T10:10:00' })
    const shortB = makeTask(3, { due_date: '2026-07-01T10:05:00', end_date: '2026-07-01T10:30:00' })
    const { container, onToggleTask } = renderWeekView([cross, shortA, shortB])

    expectContinuous(getSegments(container, 1))
    // 跨日横带保持 09:00-10:00；两个单日任务均无 ≥18 分钟窗口空档，依次让位到横带之后
    expect(geometry(getSegments(container, 1)[0]).top).toBeCloseTo(540)
    expect(geometry(getSegments(container, 1)[0]).height).toBeCloseTo(60)
    expect(geometry(getSegments(container, 2)[0]).top).toBeCloseTo(600)
    expect(geometry(getSegments(container, 3)[0]).top).toBeCloseTo(629)
    expectNoRenderedOverlaps(container)

    for (const id of [1, 2, 3]) {
      onToggleTask.mockClear()
      fireEvent.click(getCheckbox(container, id))
      expect(onToggleTask).toHaveBeenCalledTimes(1)
      expect(onToggleTask).toHaveBeenCalledWith(id)
    }
  })

  it('不同原始冲突组：同窗口四轨扩展后不覆盖 10:00 开始的后续任务', () => {
    const crossA = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const crossB = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const singleA = makeTask(3, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    const singleB = makeTask(4, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    // 原始时间与前组首尾相接（10:00 开始），属于另一个冲突组
    const later = makeTask(5, { due_date: '2026-07-01T10:00:00', end_date: '2026-07-01T11:00:00' })
    const { container, onToggleTask } = renderWeekView([crossA, crossB, singleA, singleB, later])

    // 跨日两轨各 30 分钟；两个单日任务排到横带之后，后续任务再排到它们之后
    expect(geometry(getSegments(container, 1)[0]).top).toBeCloseTo(540)
    expect(geometry(getSegments(container, 1)[0]).height).toBeCloseTo(30)
    expect(geometry(getSegments(container, 2)[0]).top).toBeCloseTo(570)
    expect(geometry(getSegments(container, 2)[0]).height).toBeCloseTo(30)
    expect(geometry(getSegments(container, 3)[0]).top).toBeCloseTo(600)
    expect(geometry(getSegments(container, 4)[0]).top).toBeCloseTo(660)
    expect(geometry(getSegments(container, 5)[0]).top).toBeCloseTo(720)
    expectNoRenderedOverlaps(container)

    for (const id of [3, 4, 5]) {
      onToggleTask.mockClear()
      fireEvent.click(getCheckbox(container, id))
      expect(onToggleTask).toHaveBeenCalledTimes(1)
      expect(onToggleTask).toHaveBeenCalledWith(id)
    }
  })

  it('跨周稳定：包含与完全重叠都不改变跨日任务锚点与高度', () => {
    // 跨日 6/28 11:00 → 7/1 12:00，窗口 11:00-12:00（660-720）
    const cross = makeTask(30, { due_date: '2026-06-28T11:00:00', end_date: '2026-07-01T12:00:00' })
    const contained = makeTask(31, { due_date: '2026-06-29T11:30:00', end_date: '2026-06-29T11:50:00' })
    const fullyOverlapped = makeTask(32, { due_date: '2026-06-29T11:00:00', end_date: '2026-06-29T12:00:00' })

    const withConflict = renderWeekView([cross, contained, fullyOverlapped], new Date(2026, 6, 1))
    const currentSegments = getSegments(withConflict.container, 30)
    expectContinuous(currentSegments)
    expect(geometry(currentSegments[0]).top).toBeCloseTo(660)
    expect(geometry(currentSegments[0]).height).toBeCloseTo(60)
    expectNoRenderedOverlaps(withConflict.container)
    withConflict.unmount()

    const withoutConflict = renderWeekView([cross], new Date(2026, 5, 24))
    const previousSegments = getSegments(withoutConflict.container, 30)
    expect(geometry(previousSegments[0]).top).toBeCloseTo(660)
    expect(geometry(previousSegments[0]).height).toBeCloseTo(60)
    withoutConflict.unmount()
  })

  it('跨周稳定：跨日任务之间的冲突在切周裁剪前后保持同一分轨', () => {
    // A 跨 6/28-7/1；B 只在 6/29-6/30。当前周两者可见，上一周仅 A 可见
    const crossA = makeTask(40, { due_date: '2026-06-28T11:00:00', end_date: '2026-07-01T12:00:00' })
    const crossB = makeTask(41, { due_date: '2026-06-29T11:00:00', end_date: '2026-06-30T12:00:00' })

    const current = renderWeekView([crossA, crossB], new Date(2026, 6, 1))
    const currentA = getSegments(current.container, 40)
    expectContinuous(currentA)
    const currentTop = geometry(currentA[0]).top
    const currentHeight = geometry(currentA[0]).height
    expectNoRenderedOverlaps(current.container)
    current.unmount()

    const previous = renderWeekView([crossA, crossB], new Date(2026, 5, 24))
    const previousA = getSegments(previous.container, 40)
    expect(geometry(previousA[0]).top).toBeCloseTo(currentTop)
    expect(geometry(previousA[0]).height).toBeCloseTo(currentHeight)
    previous.unmount()
  })

  it('被顺延 lane 任务下边缘 resize：预览保持显示位置且不压邻项，提交真实结束时间', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const mixedSingle = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    const shiftedLane = makeTask(3, { due_date: '2026-07-01T10:00:00', end_date: '2026-07-01T11:00:00' })
    const { container, onUpdateTask } = renderWeekView([cross, mixedSingle, shiftedLane])

    const laneBlock = getSegments(container, 3)[0]
    expect(geometry(laneBlock).top).toBeCloseTo(660)
    expect(geometry(laneBlock).height).toBeCloseTo(60)
    const handles = laneBlock.querySelectorAll<HTMLElement>('[data-resize-handle]')
    expect(handles).toHaveLength(2)

    fireEvent.mouseDown(handles[1], { clientY: 700 })
    fireEvent.mouseMove(window, { clientY: 715 })

    // 预览保持显示 top 660（真实 top 仍是 600），高度按真实增量变为 75；邻项 600-660 不被压住
    expect(geometry(laneBlock).top).toBeCloseTo(660)
    expect(geometry(laneBlock).height).toBeCloseTo(75)
    const neighbor = getSegments(container, 2)[0]
    expect(geometry(neighbor).top + geometry(neighbor).height).toBeLessThanOrEqual(geometry(laneBlock).top)
    expect(laneBlock.querySelectorAll('[data-resize-handle]')).toHaveLength(2)

    fireEvent.mouseUp(window)
    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const patch = onUpdateTask.mock.calls[0][1] as { end_date: string }
    const savedEnd = new Date(patch.end_date)
    expect(savedEnd.getHours()).toBe(11)
    expect(savedEnd.getMinutes()).toBe(15)
  })

  it('被顺延 lane 任务上边缘 resize：预览按新真实起点重新布局，提交真实开始时间', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const mixedSingle = makeTask(2, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-01T10:00:00' })
    const shiftedLane = makeTask(3, { due_date: '2026-07-01T10:00:00', end_date: '2026-07-01T11:00:00' })
    const { container, onUpdateTask } = renderWeekView([cross, mixedSingle, shiftedLane])

    const laneBlock = getSegments(container, 3)[0]
    expect(geometry(laneBlock).top).toBeCloseTo(660)
    const handles = laneBlock.querySelectorAll<HTMLElement>('[data-resize-handle]')
    fireEvent.mouseDown(handles[0], { clientY: 660 })
    fireEvent.mouseMove(window, { clientY: 675 })

    // 真实窗口变为 10:15-11:00；预览布局把它放回邻项之后的 11:00，高度 45，与提交后一致
    expect(geometry(laneBlock).top).toBeCloseTo(660)
    expect(geometry(laneBlock).height).toBeCloseTo(45)
    const neighbor = getSegments(container, 2)[0]
    expect(geometry(neighbor).top + geometry(neighbor).height).toBeLessThanOrEqual(geometry(laneBlock).top)

    fireEvent.mouseUp(window)
    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const patch = onUpdateTask.mock.calls[0][1] as { due_date: string }
    const savedStart = new Date(patch.due_date)
    expect(savedStart.getHours()).toBe(10)
    expect(savedStart.getMinutes()).toBe(15)
  })

  it('lane 任务 resize 预览与邻项冲突时改用横向分列，预览期间不重叠', () => {
    const first = makeTask(1, { due_date: '2026-07-01T10:00:00', end_date: '2026-07-01T11:00:00' })
    const second = makeTask(2, { due_date: '2026-07-01T11:00:00', end_date: '2026-07-01T12:00:00' })
    const { container, onUpdateTask } = renderWeekView([first, second])

    expect(geometry(getSegments(container, 1)[0]).top).toBeCloseTo(600)
    expect(geometry(getSegments(container, 2)[0]).top).toBeCloseTo(660)
    const handles = getSegments(container, 1)[0].querySelectorAll<HTMLElement>('[data-resize-handle]')
    fireEvent.mouseDown(handles[1], { clientY: 650 })
    fireEvent.mouseMove(window, { clientY: 665 })

    // 预览窗口 600-675 与邻项 660-720 相交：沿用纯单日横向分列，两者各占半列且互不覆盖
    const firstBlock = getSegments(container, 1)[0]
    const secondBlock = getSegments(container, 2)[0]
    expect(geometry(firstBlock).top).toBeCloseTo(600)
    expect(geometry(firstBlock).height).toBeCloseTo(75)
    expect(geometry(firstBlock).width).toBeCloseTo(49.25)
    expect(geometry(secondBlock).top).toBeCloseTo(660)
    expect(geometry(secondBlock).left).toBeCloseTo(50.75)
    expect(geometry(secondBlock).width).toBeCloseTo(49.25)
    expectNoRenderedOverlaps(container)

    fireEvent.mouseUp(window)
    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const patch = onUpdateTask.mock.calls[0][1] as { end_date: string }
    expect(new Date(patch.end_date).getHours()).toBe(11)
    expect(new Date(patch.end_date).getMinutes()).toBe(15)
  })

  it('跨日块保留真实端点手柄：起始段左手柄、结束段右手柄，且不与冲突任务共用区域', () => {
    const cross = makeTask(1, { due_date: '2026-07-01T09:00:00', end_date: '2026-07-02T10:00:00' })
    const lastDayOnly = makeTask(2, { due_date: '2026-07-02T09:00:00', end_date: '2026-07-02T10:00:00' })
    const { container } = renderWeekView([cross, lastDayOnly])

    const segments = getSegments(container, 1)
    expect(segments[0].querySelector('[data-span-resize-handle="start"]')).not.toBeNull()
    expect(segments[1].querySelector('[data-span-resize-handle="end"]')).not.toBeNull()
    // 子轨道模式隐藏上下时间手柄（高度是分轨展示，不代表真实时长）
    for (const segment of segments) {
      expect(segment.querySelectorAll('[data-resize-handle]')).toHaveLength(0)
    }
  })
})
